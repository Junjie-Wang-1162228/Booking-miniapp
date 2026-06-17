import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

type Options = {
  username: string;
  bindingCode: string;
  appId?: string;
};

const prisma = new PrismaClient();

function parseOptions(argv: string[]): Options {
  const options: Partial<Options> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--username' && next) {
      options.username = next;
      index += 1;
      continue;
    }

    if (arg === '--binding-code' && next) {
      options.bindingCode = next;
      index += 1;
      continue;
    }

    if (arg === '--app-id' && next) {
      options.appId = next;
      index += 1;
      continue;
    }
  }

  return {
    username: options.username || 'admin',
    bindingCode: options.bindingCode || '',
    appId: options.appId
  };
}

function resolveMiniappAppId(appId?: string) {
  const resolved = appId?.trim() || process.env.MINIAPP_APP_ID?.trim();
  if (!resolved || resolved === 'touristappid') {
    throw new Error('MINIAPP_APP_ID must be configured with the real mini program AppID');
  }
  return resolved;
}

function assertBindingCode(code: string) {
  if (!/^\d{6}$/.test(code)) {
    throw new Error('binding code must be a 6 digit code from the miniapp login screen');
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  assertBindingCode(options.bindingCode);
  const appId = resolveMiniappAppId(options.appId);

  const [admin, ticket] = await Promise.all([
    prisma.user.findUnique({
      where: { username: options.username },
      include: { staffBranchAssignments: true }
    }),
    prisma.wechatBindingTicket.findUnique({
      where: { appId_code: { appId, code: options.bindingCode } }
    })
  ]);

  if (!admin || admin.role !== UserRole.ADMIN || admin.status !== UserStatus.ACTIVE) {
    throw new Error(`active ADMIN user not found for username "${options.username}"`);
  }

  if (!admin.staffBranchAssignments.some((assignment) => assignment.status === 'ACTIVE')) {
    throw new Error(`ADMIN user "${options.username}" has no active branch assignment`);
  }

  if (!ticket || ticket.status !== 'PENDING' || ticket.expiresAt <= new Date()) {
    throw new Error('binding code is invalid, expired, or already used');
  }

  const existing = await prisma.wechatAccount.findUnique({
    where: { appId_openid: { appId, openid: ticket.openid } }
  });

  if (existing && existing.userId !== admin.id) {
    throw new Error('this WeChat account is already bound to another user');
  }

  await prisma.$transaction(async (tx) => {
    if (!existing) {
      await tx.wechatAccount.create({
        data: {
          userId: admin.id,
          appId,
          openid: ticket.openid,
          unionid: ticket.unionid
        }
      });
    }

    await tx.wechatBindingTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'BOUND',
        boundUserId: admin.id
      }
    });
  });

  console.log(`Admin WeChat binding completed for username "${options.username}".`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

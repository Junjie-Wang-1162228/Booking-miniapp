import { PrismaClient, StaffRole, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function ensureTestScope() {
  const gym =
    (await prisma.gym.findFirst({
      where: { status: UserStatus.ACTIVE },
      orderBy: { createdAt: 'asc' }
    })) ??
    (await prisma.gym.create({
      data: { name: '拳馆约课' }
    }));

  const branch =
    (await prisma.branch.findFirst({
      where: { gymId: gym.id, status: UserStatus.ACTIVE },
      orderBy: { createdAt: 'asc' }
    })) ??
    (await prisma.branch.create({
      data: {
        gymId: gym.id,
        name: '测试门店',
        address: '测试地址'
      }
    }));

  const branches = await prisma.branch.findMany({
    where: { gymId: gym.id, status: UserStatus.ACTIVE },
    orderBy: { createdAt: 'asc' }
  });

  return { gym, branch, branches };
}

async function upsertAdminUser(username: string, passwordHash: string, displayName: string) {
  return prisma.user.upsert({
    where: { username },
    update: {
      displayName,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE
    },
    create: {
      username,
      displayName,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE
    }
  });
}

async function ensureStaffAssignment(userId: string, gymId: string, branchId: string, role: StaffRole) {
  const existing = await prisma.staffBranchAssignment.findFirst({
    where: { userId, branchId, role }
  });

  if (existing) {
    await prisma.staffBranchAssignment.update({
      where: { id: existing.id },
      data: {
        gymId,
        status: UserStatus.ACTIVE,
        endsAt: null
      }
    });
    return;
  }

  await prisma.staffBranchAssignment.create({
    data: {
      userId,
      gymId,
      branchId,
      role,
      startsAt: new Date(),
      status: UserStatus.ACTIVE
    }
  });
}

async function main() {
  const { gym, branch, branches } = await ensureTestScope();
  const adminPasswordHash = await bcrypt.hash('admin', 10);
  const testPasswordHash = await bcrypt.hash('test', 10);

  const admin = await upsertAdminUser('admin', adminPasswordHash, '馆长');
  const test = await upsertAdminUser('test', testPasswordHash, '测试店长');

  for (const activeBranch of branches) {
    await ensureStaffAssignment(admin.id, gym.id, activeBranch.id, StaffRole.OWNER);
  }
  await ensureStaffAssignment(test.id, gym.id, branch.id, StaffRole.MANAGER);

  console.log('Cloud test accounts ready: admin and test.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

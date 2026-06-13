import { BadRequestException, Controller, Get, INestApplication, Type, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AttendanceStatus, BookingStatus, ClassStatus, StaffRole, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  assertDemoSeedAllowed,
  assertProductionDatabaseConfig,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_DEV_JWT_SECRET,
  DEFAULT_MANAGER_PASSWORD,
  isWechatAutoProvisionEnabled,
  resolveAdminSeedPassword,
  resolveCorsOrigin,
  resolveJwtSecret,
  resolveManagerSeedPassword
} from '../src/auth/security-config';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertE2eDatabaseIsSafeToReset } from './e2e-database-safety';

@Controller('test-errors')
class TestErrorsController {
  @Get('sensitive-bad-request')
  sensitiveBadRequest() {
    throw new BadRequestException(
      'Prisma error at /Users/Agent-space/Desktop/Booking-miniapp/apps/api/src/auth/auth.service.ts with DATABASE_URL=mysql://booking_user:booking_pass@localhost:3307/boxing_booking and JWT_SECRET=super-secret'
    );
  }

  @Get('safe-bad-request')
  safeBadRequest() {
    throw new BadRequestException('branchId is required');
  }

  @Get('sensitive-server-error')
  sensitiveServerError() {
    throw new Error(
      'Unexpected failure with DATABASE_URL=mysql://booking_user:booking_pass@localhost:3307/boxing_booking and JWT_SECRET=super-secret and openid=openid-alert-test phone=18800000001'
    );
  }
}

describe('Boxing booking API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;

  const defaultTestEnv = {
    MINIAPP_APP_ID: 'test-miniapp',
    WECHAT_LOGIN_MOCK_ENABLED: 'true',
    WECHAT_AUTO_PROVISION_ENABLED: 'true',
    WECHAT_AUTO_PROVISION_LESSONS: '10',
    WECHAT_AUTO_PROVISION_BRANCH_NAME: '城东店',
    WECHAT_NOTIFICATION_WORKER_ENABLED: 'false'
  } satisfies Record<string, string>;

  const transientTestEnvKeys = [
    'MINIAPP_APP_SECRET',
    'NODE_ENV',
    'JWT_SECRET',
    'CORS_ORIGINS',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_LOGIN_MAX',
    'RATE_LIMIT_BOOKING_MAX',
    'ALERT_WEBHOOK_URL',
    'ALERT_WEBHOOK_TOKEN',
    'WECHAT_SUBSCRIBE_CLASS_TITLE_FIELD',
    'WECHAT_SUBSCRIBE_CLASS_TIME_FIELD',
    'WECHAT_SUBSCRIBE_BRANCH_FIELD'
  ];

  function restoreBaseTestEnv() {
    Object.entries(defaultTestEnv).forEach(([key, value]) => {
      process.env[key] = value;
    });
    transientTestEnvKeys.forEach((key) => {
      delete process.env[key];
    });
  }

  restoreBaseTestEnv();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    prisma = moduleRef.get(PrismaService);
    notifications = moduleRef.get(NotificationsService);
    await app.init();
    await resetTestData();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    restoreBaseTestEnv();
  });

  async function resetTestData() {
    assertE2eDatabaseIsSafeToReset();

    const passwordHash = await bcrypt.hash('admin123456', 10);
    const managerPasswordHash = await bcrypt.hash('manager123456', 10);
    await prisma.wechatBindingTicket.deleteMany();
    await prisma.wechatAccount.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.notificationLog.deleteMany();
    await prisma.notificationJob.deleteMany();
    await prisma.lessonDeduction.deleteMany();
    await prisma.lessonBalanceAdjustment.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.boxingClass.deleteMany();
    await prisma.lessonBalance.deleteMany();
    await prisma.staffBranchAssignment.deleteMany();
    await prisma.memberBranch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.gym.deleteMany();

    const gym = await prisma.gym.create({ data: { name: '拳馆约课' } });
    const eastBranch = await prisma.branch.create({
      data: { gymId: gym.id, name: '城东店', address: '城东训练中心', phone: '18810000001' }
    });
    const westBranch = await prisma.branch.create({
      data: { gymId: gym.id, name: '城西店', address: '城西训练中心', phone: '18810000002' }
    });

    const admin = await prisma.user.upsert({
      where: { username: 'admin' },
      update: { displayName: '馆长', role: UserRole.ADMIN, passwordHash, status: 'ACTIVE' },
      create: { username: 'admin', displayName: '馆长', role: UserRole.ADMIN, passwordHash }
    });
    const eastManager = await prisma.user.upsert({
      where: { username: 'east-manager' },
      update: { displayName: '东店店长', role: UserRole.ADMIN, passwordHash: managerPasswordHash, status: 'ACTIVE' },
      create: {
        username: 'east-manager',
        displayName: '东店店长',
        role: UserRole.ADMIN,
        passwordHash: managerPasswordHash
      }
    });
    const coach = await prisma.user.upsert({
      where: { username: 'coach-leo' },
      update: { displayName: 'Coach Leo', nickname: 'Coach Leo', role: UserRole.USER, status: 'ACTIVE' },
      create: { username: 'coach-leo', displayName: 'Coach Leo', nickname: 'Coach Leo', role: UserRole.USER }
    });
    const memberA = await prisma.user.upsert({
      where: { phone: '18800000001' },
      update: { displayName: '阿杰', role: UserRole.USER, status: 'ACTIVE' },
      create: { phone: '18800000001', displayName: '阿杰', role: UserRole.USER }
    });
    const memberB = await prisma.user.upsert({
      where: { phone: '18800000002' },
      update: { displayName: '小林', role: UserRole.USER, status: 'ACTIVE' },
      create: { phone: '18800000002', displayName: '小林', role: UserRole.USER }
    });
    const memberC = await prisma.user.upsert({
      where: { phone: '18800000003' },
      update: { displayName: '东店同学', role: UserRole.USER, status: 'ACTIVE' },
      create: { phone: '18800000003', displayName: '东店同学', role: UserRole.USER }
    });

    const now = new Date();
    await prisma.staffBranchAssignment.createMany({
      data: [
        { gymId: gym.id, branchId: eastBranch.id, userId: admin.id, role: StaffRole.OWNER, startsAt: now },
        { gymId: gym.id, branchId: westBranch.id, userId: admin.id, role: StaffRole.OWNER, startsAt: now },
        { gymId: gym.id, branchId: eastBranch.id, userId: eastManager.id, role: StaffRole.MANAGER, startsAt: now },
        { gymId: gym.id, branchId: eastBranch.id, userId: coach.id, role: StaffRole.COACH, startsAt: now },
        { gymId: gym.id, branchId: westBranch.id, userId: coach.id, role: StaffRole.COACH, startsAt: now }
      ]
    });
    await prisma.memberBranch.createMany({
      data: [
        { gymId: gym.id, branchId: eastBranch.id, userId: memberA.id, memberNo: 'E-001', isDefault: true },
        { gymId: gym.id, branchId: eastBranch.id, userId: memberC.id, memberNo: 'E-002', isDefault: true },
        { gymId: gym.id, branchId: westBranch.id, userId: memberB.id, memberNo: 'W-001', isDefault: true }
      ]
    });
    await prisma.lessonBalance.upsert({
      where: { userId_branchId: { userId: memberA.id, branchId: eastBranch.id } },
      update: { remaining: 10 },
      create: { gymId: gym.id, branchId: eastBranch.id, userId: memberA.id, remaining: 10 }
    });
    await prisma.lessonBalance.upsert({
      where: { userId_branchId: { userId: memberB.id, branchId: westBranch.id } },
      update: { remaining: 6 },
      create: { gymId: gym.id, branchId: westBranch.id, userId: memberB.id, remaining: 6 }
    });
    await prisma.lessonBalance.upsert({
      where: { userId_branchId: { userId: memberC.id, branchId: eastBranch.id } },
      update: { remaining: 4 },
      create: { gymId: gym.id, branchId: eastBranch.id, userId: memberC.id, remaining: 4 }
    });

    await prisma.boxingClass.createMany({
      data: [
        {
          gymId: gym.id,
          branchId: eastBranch.id,
          coachId: coach.id,
          title: '基础拳击燃脂',
          coachNameSnapshot: 'Coach Leo',
          startsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          durationMin: 60,
          capacity: 8,
          description: '适合新手和恢复训练，重点练习步伐、直拳和基础组合。'
        },
        {
          gymId: gym.id,
          branchId: westBranch.id,
          coachId: coach.id,
          title: '进阶组合拳',
          coachNameSnapshot: 'Coach Leo',
          startsAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
          durationMin: 75,
          capacity: 6,
          description: '强化组合拳、闪躲和节奏控制，适合有基础的会员。'
        },
        {
          gymId: gym.id,
          branchId: eastBranch.id,
          coachId: coach.id,
          title: '周末实战体能',
          coachNameSnapshot: 'Coach Leo',
          startsAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
          durationMin: 90,
          capacity: 10,
          description: '拳击体能、核心力量和轻实战演练，强度较高。'
        }
      ]
    });

    expect(admin.role).toBe('ADMIN');
  }

  it('returns API health', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ ok: true });
  });

  it('logs in an admin and returns an admin JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/admin-login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      role: 'ADMIN',
      displayName: '馆长'
    });
  });

  it('logs in seeded member A through the development mini program login', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/dev-login')
      .send({ member: 'member-a' })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      role: 'USER',
      displayName: '阿杰',
      phone: '18800000001'
    });
    expect(response.body.user.accessibleBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          name: '城东店',
          memberNo: 'E-001',
          lessonBalance: { remaining: 10 }
        })
      ])
    );
    expect(response.body.user.defaultBranchId).toEqual(expect.any(String));
  });

  it('logs in an existing WeChat-bound member', async () => {
    const member = await prisma.user.findUniqueOrThrow({ where: { phone: '18800000001' } });
    await prisma.wechatAccount.create({
      data: {
        userId: member.id,
        appId: 'test-miniapp',
        openid: 'openid-existing-ajie'
      }
    });

    const response = await request(app.getHttpServer())
      .post('/auth/wechat-login')
      .send({ code: 'mock:openid-existing-ajie' })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      role: 'USER',
      displayName: '阿杰',
      phone: '18800000001'
    });
    expect(response.body.user.accessibleBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '城东店',
          lessonBalance: { remaining: 10 }
        })
      ])
    );
  });

  it('auto-provisions a new WeChat member for an unknown openid', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/wechat-login')
      .send({ code: 'mock:openid-new-001' })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      role: 'USER',
      displayName: '微信测试会员-new001',
      phone: null,
      lessonBalance: { remaining: 10 }
    });
    expect(response.body.user.defaultBranchId).toEqual(expect.any(String));

    const account = await prisma.wechatAccount.findUniqueOrThrow({
      where: { appId_openid: { appId: 'test-miniapp', openid: 'openid-new-001' } },
      include: { user: true }
    });
    expect(account.user.displayName).toBe('微信测试会员-new001');

    const branch = await prisma.memberBranch.findFirstOrThrow({
      where: { userId: account.userId },
      include: { branch: true }
    });
    expect(branch.branch.name).toBe('城东店');

    const balance = await prisma.lessonBalance.findUniqueOrThrow({
      where: { userId_branchId: { userId: account.userId, branchId: branch.branchId } }
    });
    expect(balance.remaining).toBe(10);
  });

  it('rejects an unknown WeChat account when auto-provisioning is disabled', async () => {
    process.env.WECHAT_AUTO_PROVISION_ENABLED = 'false';
    try {
      const response = await request(app.getHttpServer())
        .post('/auth/wechat-login')
        .send({ code: 'mock:openid-rejected-001' })
        .expect(403);

      expect(response.body).toMatchObject({
        message: 'Wechat account is not bound to a member',
        bindingCode: expect.stringMatching(/^\d{6}$/)
      });

      const account = await prisma.wechatAccount.findUnique({
        where: { appId_openid: { appId: 'test-miniapp', openid: 'openid-rejected-001' } }
      });
      expect(account).toBeNull();
    } finally {
      process.env.WECHAT_AUTO_PROVISION_ENABLED = 'true';
    }
  });

  it('returns the current member with lesson balance from a JWT', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/dev-login')
      .send({ member: 'member-a' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      role: 'USER',
      displayName: '阿杰',
      phone: '18800000001',
      lessonBalance: { remaining: 10 }
    });
    expect(response.body.accessibleBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          name: '城东店',
          lessonBalance: { remaining: 10 }
        })
      ])
    );
    expect(response.body.defaultBranchId).toEqual(expect.any(String));
  });

  it('returns the current member branch list', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/dev-login')
      .send({ member: 'member-a' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/branches/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        name: '城东店',
        memberNo: 'E-001',
        lessonBalance: { remaining: 10 }
      })
    ]);
  });

  it('returns admin accessible branches', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/admin-login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/admin/branches')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(response.body.map((branch: { name: string }) => branch.name).sort()).toEqual(['城东店', '城西店']);
  });

  describe('admin member binding', () => {
    async function adminToken(username = 'admin', password = 'admin123456') {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken(member: 'member-a' | 'member-b' = 'member-a') {
      const response = await request(app.getHttpServer()).post('/auth/dev-login').send({ member }).expect(201);
      return response.body.accessToken as string;
    }

    async function branchIdByName(name: string) {
      const branch = await prisma.branch.findFirstOrThrow({ where: { name }, select: { id: true } });
      return branch.id;
    }

    function restoreEnv(key: string, value: string | undefined) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    it('lets admins create a member profile, bind a WeChat openid, and then log in through WeChat', async () => {
      const unique = String(Date.now()).slice(-6);
      const phone = `18800${unique}`;
      const openid = `openid-bound-later-${unique}`;
      const originalAutoProvision = process.env.WECHAT_AUTO_PROVISION_ENABLED;
      process.env.WECHAT_AUTO_PROVISION_ENABLED = 'false';
      const admin = await adminToken();
      const branchId = await branchIdByName('城东店');

      try {
        await request(app.getHttpServer())
          .post('/auth/wechat-login')
          .send({ code: `mock:${openid}` })
          .expect(403);

        const created = await request(app.getHttpServer())
          .post('/admin/members')
          .set('Authorization', `Bearer ${admin}`)
          .send({
            branchId,
            displayName: '绑定测试会员',
            phone,
            memberNo: 'E-999',
            initialLessons: 12,
            wechatOpenid: openid
          })
          .expect(201);

        expect(created.body).toMatchObject({
          displayName: '绑定测试会员',
          phone,
          branchId,
          memberNo: 'E-999',
          lessonBalance: { remaining: 12 },
          wechatBound: true
        });

        const createAuditLog = await prisma.auditLog.findFirstOrThrow({
          where: { action: 'MEMBER_CREATE', entityId: created.body.id }
        });
        expect(createAuditLog.message).toBe('创建会员：绑定测试会员');

        const bindAuditLog = await prisma.auditLog.findFirstOrThrow({
          where: { action: 'WECHAT_BIND', entityId: created.body.id }
        });
        expect(bindAuditLog.message).toBe('绑定会员微信账号');

        const login = await request(app.getHttpServer())
          .post('/auth/wechat-login')
          .send({ code: `mock:${openid}` })
          .expect(201);

        expect(login.body.user).toMatchObject({
          id: created.body.id,
          displayName: '绑定测试会员',
          phone,
          defaultBranchId: branchId,
          lessonBalance: { remaining: 12 }
        });
      } finally {
        restoreEnv('WECHAT_AUTO_PROVISION_ENABLED', originalAutoProvision);
      }
    });

    it('lets admins bind a WeChat openid to an existing member profile', async () => {
      const originalAutoProvision = process.env.WECHAT_AUTO_PROVISION_ENABLED;
      process.env.WECHAT_AUTO_PROVISION_ENABLED = 'false';
      const admin = await adminToken();
      const branchId = await branchIdByName('城东店');
      const member = await prisma.user.findUniqueOrThrow({ where: { phone: '18800000001' } });

      try {
        const bound = await request(app.getHttpServer())
          .post(`/admin/members/${member.id}/wechat-bind`)
          .set('Authorization', `Bearer ${admin}`)
          .send({ branchId, wechatOpenid: 'openid-existing-bind-flow' })
          .expect(200);

        expect(bound.body).toMatchObject({
          id: member.id,
          displayName: '阿杰',
          branchId,
          wechatBound: true
        });

        const auditLog = await prisma.auditLog.findFirstOrThrow({
          where: { action: 'WECHAT_BIND', entityId: member.id }
        });
        expect(auditLog.message).toBe('绑定会员微信账号');

        const login = await request(app.getHttpServer())
          .post('/auth/wechat-login')
          .send({ code: 'mock:openid-existing-bind-flow' })
          .expect(201);
        expect(login.body.user).toMatchObject({
          id: member.id,
          displayName: '阿杰',
          defaultBranchId: branchId
        });
      } finally {
        restoreEnv('WECHAT_AUTO_PROVISION_ENABLED', originalAutoProvision);
      }
    });

    it('lets admins unbind a mistaken WeChat openid and bind it to another member', async () => {
      const unique = String(Date.now()).slice(-6);
      const openid = `openid-rebind-${unique}`;
      const admin = await adminToken();
      const branchId = await branchIdByName('城东店');

      const firstMember = await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: '错绑会员',
          phone: `18803${unique}`,
          memberNo: `R-A-${unique}`,
          initialLessons: 1,
          wechatOpenid: openid
        })
        .expect(201);

      const secondMember = await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: '改绑会员',
          phone: `18804${unique}`,
          memberNo: `R-B-${unique}`,
          initialLessons: 2
        })
        .expect(201);

      const unbound = await request(app.getHttpServer())
        .post(`/admin/members/${firstMember.body.id}/wechat-unbind`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ branchId })
        .expect(200);

      expect(unbound.body).toMatchObject({
        id: firstMember.body.id,
        wechatBound: false
      });

      const auditLog = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'WECHAT_UNBIND',
          entityId: firstMember.body.id
        }
      });
      expect(auditLog.message).toBe('解绑会员微信账号');

      const rebound = await request(app.getHttpServer())
        .post(`/admin/members/${secondMember.body.id}/wechat-bind`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ branchId, wechatOpenid: openid })
        .expect(200);

      expect(rebound.body).toMatchObject({
        id: secondMember.body.id,
        wechatBound: true
      });
    });

    it('lets admins bind a pending WeChat login code to an existing member profile', async () => {
      const originalAutoProvision = process.env.WECHAT_AUTO_PROVISION_ENABLED;
      process.env.WECHAT_AUTO_PROVISION_ENABLED = 'false';
      const admin = await adminToken();
      const branchId = await branchIdByName('城东店');
      const member = await prisma.user.findUniqueOrThrow({ where: { phone: '18800000001' } });
      const openid = 'openid-pending-bind-code';

      try {
        const rejected = await request(app.getHttpServer())
          .post('/auth/wechat-login')
          .send({ code: `mock:${openid}` })
          .expect(403);

        const bindingCode = rejected.body.bindingCode as string;
        expect(bindingCode).toEqual(expect.stringMatching(/^\d{6}$/));

        const bound = await request(app.getHttpServer())
          .post(`/admin/members/${member.id}/wechat-bind`)
          .set('Authorization', `Bearer ${admin}`)
          .send({ branchId, bindingCode })
          .expect(200);

        expect(bound.body).toMatchObject({
          id: member.id,
          displayName: '阿杰',
          branchId,
          wechatBound: true
        });

        const login = await request(app.getHttpServer())
          .post('/auth/wechat-login')
          .send({ code: `mock:${openid}` })
          .expect(201);
        expect(login.body.user).toMatchObject({
          id: member.id,
          displayName: '阿杰',
          defaultBranchId: branchId
        });
      } finally {
        restoreEnv('WECHAT_AUTO_PROVISION_ENABLED', originalAutoProvision);
      }
    });

    it('lets admins update member contact details with an audit record', async () => {
      const unique = String(Date.now()).slice(-6);
      const admin = await adminToken();
      const branchId = await branchIdByName('城东店');

      const created = await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: '待改资料会员',
          phone: `18805${unique}`,
          memberNo: `UP-A-${unique}`,
          initialLessons: 3
        })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/admin/members/${created.body.id}`)
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: '已改资料会员',
          phone: `18806${unique}`,
          memberNo: `UP-B-${unique}`
        })
        .expect(200);

      expect(updated.body).toMatchObject({
        id: created.body.id,
        branchId,
        displayName: '已改资料会员',
        phone: `18806${unique}`,
        memberNo: `UP-B-${unique}`
      });

      const auditLog = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'MEMBER_UPDATE',
          entityId: created.body.id
        }
      });
      expect(auditLog.message).toBe('更新会员资料：已改资料会员');
    });

    it('rejects updating a member phone to another member phone', async () => {
      const unique = String(Date.now()).slice(-6);
      const admin = await adminToken();
      const branchId = await branchIdByName('城东店');

      const first = await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: '手机号占用会员',
          phone: `18807${unique}`,
          initialLessons: 1
        })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: '手机号待改会员',
          phone: `18808${unique}`,
          initialLessons: 1
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/admin/members/${second.body.id}`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ branchId, phone: first.body.phone })
        .expect(409)
        .expect(({ body }) => {
          expect(body.message).toBe('Member phone already exists');
        });
    });

    it('scopes member management by admin branch access and rejects regular users', async () => {
      const unique = String(Date.now()).slice(-6);
      const eastPhone = `18801${unique}`;
      const westPhone = `18802${unique}`;
      const eastManager = await adminToken('east-manager', 'manager123456');
      const member = await userToken('member-a');
      const eastBranchId = await branchIdByName('城东店');
      const westBranchId = await branchIdByName('城西店');

      const created = await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${eastManager}`)
        .send({
          branchId: eastBranchId,
          displayName: '东店绑定会员',
          phone: eastPhone,
          initialLessons: 3
        })
        .expect(201);
      expect(created.body.branchId).toBe(eastBranchId);

      await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${eastManager}`)
        .send({
          branchId: westBranchId,
          displayName: '跨店绑定会员',
          phone: westPhone,
          initialLessons: 3
        })
        .expect(403);

      const list = await request(app.getHttpServer())
        .get('/admin/members')
        .set('Authorization', `Bearer ${eastManager}`)
        .expect(200);
      expect(list.body.some((item: { id: string }) => item.id === created.body.id)).toBe(true);
      expect(list.body.every((item: { branchId: string }) => item.branchId === eastBranchId)).toBe(true);

      await request(app.getHttpServer())
        .get('/admin/members')
        .set('Authorization', `Bearer ${member}`)
        .expect(403);
    });

    it('lets admins adjust branch-scoped lesson balances with adjustment and audit records', async () => {
      const unique = String(Date.now()).slice(-6);
      const admin = await adminToken();
      const branchId = await branchIdByName('城东店');

      const created = await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: '课时调整会员',
          phone: `18803${unique}`,
          initialLessons: 2
        })
        .expect(201);

      const added = await request(app.getHttpServer())
        .post(`/admin/members/${created.body.id}/lesson-adjustments`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ branchId, delta: 5, reason: '购买新课包' })
        .expect(200);
      expect(added.body.member).toMatchObject({
        id: created.body.id,
        branchId,
        lessonBalance: { remaining: 7 }
      });
      expect(added.body.adjustment).toMatchObject({
        userId: created.body.id,
        branchId,
        delta: 5,
        beforeRemaining: 2,
        afterRemaining: 7,
        reason: '购买新课包',
        adminId: expect.any(String)
      });

      const deducted = await request(app.getHttpServer())
        .post(`/admin/members/${created.body.id}/lesson-adjustments`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ branchId, delta: -3, reason: '人工纠错扣减' })
        .expect(200);
      expect(deducted.body.member.lessonBalance.remaining).toBe(4);
      expect(deducted.body.adjustment).toMatchObject({
        delta: -3,
        beforeRemaining: 7,
        afterRemaining: 4,
        reason: '人工纠错扣减'
      });

      const adjustments = await prisma.$queryRawUnsafe<
        Array<{
          delta: number;
          beforeRemaining: number;
          afterRemaining: number;
          reason: string;
          adminId: string;
        }>
      >(
        'SELECT delta, beforeRemaining, afterRemaining, reason, adminId FROM LessonBalanceAdjustment WHERE userId = ? AND branchId = ? ORDER BY createdAt ASC',
        created.body.id,
        branchId
      );
      expect(
        adjustments.map((adjustment) => ({
          delta: adjustment.delta,
          beforeRemaining: adjustment.beforeRemaining,
          afterRemaining: adjustment.afterRemaining,
          reason: adjustment.reason,
          hasAdmin: Boolean(adjustment.adminId)
        }))
      ).toEqual([
        { delta: 5, beforeRemaining: 2, afterRemaining: 7, reason: '购买新课包', hasAdmin: true },
        { delta: -3, beforeRemaining: 7, afterRemaining: 4, reason: '人工纠错扣减', hasAdmin: true }
      ]);

      const auditLogs = await prisma.auditLog.findMany({
        where: { action: 'LESSON_ADJUST', entityId: created.body.id },
        orderBy: { createdAt: 'asc' }
      });
      expect(auditLogs).toHaveLength(2);
      expect(auditLogs[0]).toMatchObject({
        branchId,
        message: expect.stringContaining('课时调整')
      });
    });

    it('returns a member lesson ledger with adjustments and deductions scoped by branch', async () => {
      const unique = String(Date.now()).slice(-6);
      const admin = await adminToken();
      const member = await userToken('member-a');
      const branchId = await branchIdByName('城东店');

      const created = await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: '流水查看会员',
          phone: `18809${unique}`,
          initialLessons: 2
        })
        .expect(201);

      const added = await request(app.getHttpServer())
        .post(`/admin/members/${created.body.id}/lesson-adjustments`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ branchId, delta: 3, reason: '购买 3 节课' })
        .expect(200);

      const boxingClass = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: `流水消课课程 ${unique}`,
          coach: 'Coach Ledger',
          startsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
          durationMin: 60,
          capacity: 6,
          description: '用于验证会员课时流水'
        })
        .expect(201);

      const booking = await prisma.booking.create({
        data: {
          gymId: boxingClass.body.gymId,
          branchId,
          userId: created.body.id,
          classId: boxingClass.body.id
        }
      });

      const deduction = await request(app.getHttpServer())
        .post(`/admin/bookings/${booking.id}/deduct`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ note: '到店上课' })
        .expect(201);

      const ledger = await request(app.getHttpServer())
        .get(`/admin/members/${created.body.id}/lesson-ledger?branchId=${branchId}`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      expect(ledger.body.member).toMatchObject({
        id: created.body.id,
        branchId,
        displayName: '流水查看会员',
        lessonBalance: { remaining: 4 }
      });
      expect(ledger.body.entries).toHaveLength(2);
      expect(ledger.body.entries.map((entry: { type: string }) => entry.type)).toEqual(['DEDUCTION', 'ADJUSTMENT']);
      expect(ledger.body.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: added.body.adjustment.id,
            type: 'ADJUSTMENT',
            delta: 3,
            beforeRemaining: 2,
            afterRemaining: 5,
            reason: '购买 3 节课',
            admin: expect.objectContaining({ displayName: expect.any(String) })
          }),
          expect.objectContaining({
            id: deduction.body.id,
            type: 'DEDUCTION',
            delta: -1,
            reason: '到店上课',
            boxingClass: expect.objectContaining({
              title: boxingClass.body.title,
              coach: 'Coach Ledger'
            })
          })
        ])
      );

      await request(app.getHttpServer())
        .get(`/admin/members/${created.body.id}/lesson-ledger?branchId=${branchId}`)
        .set('Authorization', `Bearer ${member}`)
        .expect(403);
    });

    it('rejects lesson adjustments that would make the balance negative', async () => {
      const unique = String(Date.now()).slice(-6);
      const admin = await adminToken();
      const branchId = await branchIdByName('城东店');

      const created = await request(app.getHttpServer())
        .post('/admin/members')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: '课时负数保护',
          phone: `18804${unique}`,
          initialLessons: 1
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/admin/members/${created.body.id}/lesson-adjustments`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ branchId, delta: -2, reason: '错误扣减' })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe('Lesson balance cannot be negative');
        });

      const balance = await prisma.lessonBalance.findUniqueOrThrow({
        where: { userId_branchId: { userId: created.body.id, branchId } }
      });
      expect(balance.remaining).toBe(1);
    });
  });

  describe('security configuration', () => {
    const config = (values: Record<string, string | undefined>) => ({
      get: (key: string) => values[key]
    });

    async function createAppWithEnv(values: Record<string, string>, controllers: Type<unknown>[] = []) {
      const previousValues = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
      let restored = false;
      const restoreEnv = () => {
        if (restored) {
          return;
        }
        restored = true;
        Object.entries(previousValues).forEach(([key, value]) => {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        });
      };

      Object.entries(values).forEach(([key, value]) => {
        process.env[key] = value;
      });

      try {
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule],
          controllers
        }).compile();
        const isolatedApp = moduleRef.createNestApplication();
        isolatedApp.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
        await isolatedApp.init();
        const close = isolatedApp.close.bind(isolatedApp);
        isolatedApp.close = async () => {
          try {
            await close();
          } finally {
            restoreEnv();
          }
        };
        return isolatedApp;
      } catch (error) {
        restoreEnv();
        throw error;
      }
    }

    it('allows the development JWT fallback outside production only', () => {
      expect(resolveJwtSecret(config({ NODE_ENV: 'development' }))).toBe(DEFAULT_DEV_JWT_SECRET);
      expect(() => resolveJwtSecret(config({ NODE_ENV: 'production' }))).toThrow(
        'JWT_SECRET must be set to a non-default value in production'
      );
      expect(() =>
        resolveJwtSecret({ get: (key: string) => (key === 'JWT_SECRET' ? DEFAULT_DEV_JWT_SECRET : 'production') })
      ).toThrow('JWT_SECRET must be set to a non-default value in production');
      expect(resolveJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET: 'production-secret-123' }))).toBe(
        'production-secret-123'
      );
    });

    it('defaults WeChat auto-provisioning off in production', () => {
      expect(isWechatAutoProvisionEnabled(config({ NODE_ENV: 'development' }))).toBe(true);
      expect(isWechatAutoProvisionEnabled(config({ NODE_ENV: 'production' }))).toBe(false);
      expect(isWechatAutoProvisionEnabled(config({ NODE_ENV: 'production', WECHAT_AUTO_PROVISION_ENABLED: 'true' }))).toBe(
        true
      );
    });

    it('requires explicit production CORS origins and allows permissive CORS only outside production', () => {
      expect(resolveCorsOrigin(config({ NODE_ENV: 'development' }))).toBe(true);
      expect(() => resolveCorsOrigin(config({ NODE_ENV: 'production' }))).toThrow(
        'CORS_ORIGINS must be set in production'
      );
      expect(
        resolveCorsOrigin(
          config({
            NODE_ENV: 'production',
            CORS_ORIGINS: 'https://admin.example.com, https://ops.example.com '
          })
        )
      ).toEqual(['https://admin.example.com', 'https://ops.example.com']);
    });

    it('rejects unsafe production database configuration', () => {
      expect(() =>
        assertProductionDatabaseConfig(
          config({ NODE_ENV: 'development', DATABASE_URL: 'mysql://root:root@localhost:3306/boxing_booking' })
        )
      ).not.toThrow();
      expect(() => assertProductionDatabaseConfig(config({ NODE_ENV: 'production' }))).toThrow(
        'DATABASE_URL must be set in production'
      );
      expect(() =>
        assertProductionDatabaseConfig(
          config({ NODE_ENV: 'production', DATABASE_URL: 'mysql://booking_user:booking_pass@localhost:3307/boxing_booking' })
        )
      ).toThrow('DATABASE_URL must not point to a local database in production');
      expect(() =>
        assertProductionDatabaseConfig(
          config({ NODE_ENV: 'production', DATABASE_URL: 'mysql://root:prod-pass@db.example.com:3306/boxing_booking_prod' })
        )
      ).toThrow('DATABASE_URL must not use a superuser account in production');
      expect(() =>
        assertProductionDatabaseConfig(
          config({ NODE_ENV: 'production', DATABASE_URL: 'mysql://booking_user:prod-pass@db.example.com:3306/boxing_booking_prod' })
        )
      ).toThrow('DATABASE_URL must not use the example local database user in production');
      expect(() =>
        assertProductionDatabaseConfig(
          config({ NODE_ENV: 'production', DATABASE_URL: 'mysql://booking_app:prod-pass@db.example.com:3306/boxing_booking_shadow' })
        )
      ).toThrow('DATABASE_URL must not point to a development, test, or shadow database in production');
      expect(() =>
        assertProductionDatabaseConfig(
          config({ NODE_ENV: 'production', DATABASE_URL: 'mysql://booking_app:prod-pass@db.example.com:3306/boxing_booking_prod' })
        )
      ).not.toThrow();
    });

    it('blocks default seeded admin passwords in production', () => {
      expect(resolveAdminSeedPassword(config({ NODE_ENV: 'development' }))).toBe(DEFAULT_ADMIN_PASSWORD);
      expect(resolveAdminSeedPassword(config({ NODE_ENV: 'development', ADMIN_PASSWORD: ' local-admin-pass ' }))).toBe(
        'local-admin-pass'
      );
      expect(resolveManagerSeedPassword(config({ NODE_ENV: 'development' }))).toBe(DEFAULT_MANAGER_PASSWORD);
      expect(() => resolveAdminSeedPassword(config({ NODE_ENV: 'production' }))).toThrow(
        'ADMIN_PASSWORD must be set to a non-default value in production'
      );
      expect(() =>
        resolveAdminSeedPassword(config({ NODE_ENV: 'production', ADMIN_PASSWORD: DEFAULT_ADMIN_PASSWORD }))
      ).toThrow('ADMIN_PASSWORD must be set to a non-default value in production');
      expect(() => resolveManagerSeedPassword(config({ NODE_ENV: 'production' }))).toThrow(
        'MANAGER_PASSWORD must be set to a non-default value in production'
      );
      expect(() =>
        resolveManagerSeedPassword(config({ NODE_ENV: 'production', MANAGER_PASSWORD: DEFAULT_MANAGER_PASSWORD }))
      ).toThrow('MANAGER_PASSWORD must be set to a non-default value in production');
      expect(resolveAdminSeedPassword(config({ NODE_ENV: 'production', ADMIN_PASSWORD: 'production-admin-pass' }))).toBe(
        'production-admin-pass'
      );
      expect(
        resolveManagerSeedPassword(config({ NODE_ENV: 'production', MANAGER_PASSWORD: 'production-manager-pass' }))
      ).toBe('production-manager-pass');
    });

    it('blocks demo seed data in production even with non-default passwords', () => {
      expect(() => assertDemoSeedAllowed(config({ NODE_ENV: 'development' }))).not.toThrow();
      expect(() =>
        assertDemoSeedAllowed(
          config({
            NODE_ENV: 'production',
            ADMIN_PASSWORD: 'production-admin-pass',
            MANAGER_PASSWORD: 'production-manager-pass'
          })
        )
      ).toThrow('Demo seed data must not be loaded in production');
    });

    it('rejects seeded default admin passwords at runtime in production', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        await request(app.getHttpServer())
          .post('/auth/admin-login')
          .send({ username: 'admin', password: DEFAULT_ADMIN_PASSWORD })
          .expect(401);
        await request(app.getHttpServer())
          .post('/auth/admin-login')
          .send({ username: 'east-manager', password: DEFAULT_MANAGER_PASSWORD })
          .expect(401);
      } finally {
        if (previousNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = previousNodeEnv;
        }
      }
    });

    it('redacts sensitive error details from production responses while preserving safe client messages', async () => {
      const productionApp = await createAppWithEnv(
        {
          NODE_ENV: 'production',
          JWT_SECRET: 'production-secret-123',
          CORS_ORIGINS: 'https://admin.example.com'
        },
        [TestErrorsController]
      );

      try {
        const sensitive = await request(productionApp.getHttpServer())
          .get('/test-errors/sensitive-bad-request')
          .expect(400);
        const serializedSensitive = JSON.stringify(sensitive.body);

        expect(serializedSensitive).toContain('Bad request');
        expect(serializedSensitive).not.toContain('DATABASE_URL');
        expect(serializedSensitive).not.toContain('JWT_SECRET');
        expect(serializedSensitive).not.toContain('booking_pass');
        expect(serializedSensitive).not.toContain('mysql://');
        expect(serializedSensitive).not.toContain('/Users/Agent-space');
        expect(serializedSensitive).not.toContain('apps/api/src');

        const safe = await request(productionApp.getHttpServer()).get('/test-errors/safe-bad-request').expect(400);
        expect(safe.body.message).toBe('branchId is required');
      } finally {
        await productionApp.close();
      }
    });

    it('alerts unhandled server errors without leaking sensitive details', async () => {
      const productionApp = await createAppWithEnv(
        {
          NODE_ENV: 'production',
          JWT_SECRET: 'production-secret-123',
          CORS_ORIGINS: 'https://admin.example.com',
          ALERT_WEBHOOK_URL: 'https://alerts.example.com/boxing-booking'
        },
        [TestErrorsController]
      );
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        json: async () => ({ ok: true })
      } as unknown as Response);

      try {
        const response = await request(productionApp.getHttpServer())
          .get('/test-errors/sensitive-server-error')
          .expect(500);
        expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });

        await new Promise((resolve) => setImmediate(resolve));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          'https://alerts.example.com/boxing-booking',
          expect.objectContaining({ method: 'POST' })
        );

        const payload = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
        const serialized = JSON.stringify(payload);
        expect(payload).toMatchObject({
          source: 'api',
          event: 'http_server_error',
          severity: 'critical',
          metadata: expect.objectContaining({
            statusCode: 500,
            method: 'GET',
            path: '/test-errors/sensitive-server-error'
          })
        });
        expect(serialized).not.toContain('DATABASE_URL');
        expect(serialized).not.toContain('booking_pass');
        expect(serialized).not.toContain('JWT_SECRET');
        expect(serialized).not.toContain('super-secret');
        expect(serialized).not.toContain('openid-alert-test');
        expect(serialized).not.toContain('18800000001');
      } finally {
        fetchMock.mockRestore();
        await productionApp.close();
      }
    });

    it('rate limits repeated login and booking requests', async () => {
      const limitedApp = await createAppWithEnv({
        RATE_LIMIT_WINDOW_MS: '60000',
        RATE_LIMIT_LOGIN_MAX: '1',
        RATE_LIMIT_BOOKING_MAX: '1'
      });

      try {
        await request(limitedApp.getHttpServer())
          .post('/auth/admin-login')
          .send({ username: 'admin', password: 'admin123456' })
          .expect(201);
        await request(limitedApp.getHttpServer())
          .post('/auth/admin-login')
          .send({ username: 'admin', password: 'wrong-password' })
          .expect(429)
          .expect(({ body }) => {
            expect(body.message).toBe('Too many requests');
          });

        const admin = await request(app.getHttpServer())
          .post('/auth/admin-login')
          .send({ username: 'admin', password: 'admin123456' })
          .expect(201);
        const member = await request(app.getHttpServer())
          .post('/auth/dev-login')
          .send({ member: 'member-a' })
          .expect(201);
        const branchId = member.body.user.defaultBranchId as string;
        const boxingClass = await request(app.getHttpServer())
          .post('/admin/classes')
          .set('Authorization', `Bearer ${admin.body.accessToken}`)
          .send({
            branchId,
            title: `限流预约测试 ${Date.now()} ${Math.random()}`,
            coach: 'Coach Rate',
            startsAt: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toISOString(),
            durationMin: 60,
            capacity: 5,
            description: '预约限流测试课程'
          })
          .expect(201);

        await request(limitedApp.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${member.body.accessToken}`)
          .send({ classId: boxingClass.body.id, branchId })
          .expect(201);
        await request(limitedApp.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${member.body.accessToken}`)
          .send({ classId: boxingClass.body.id, branchId })
          .expect(429)
          .expect(({ body }) => {
            expect(body.message).toBe('Too many requests');
          });
      } finally {
        await limitedApp.close();
      }
    });
  });

  describe('classes', () => {
    const futureIso = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    async function adminToken(username = 'admin', password = 'admin123456') {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken(member: 'member-a' | 'member-c' = 'member-a') {
      const response = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ member })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function memberSession() {
      const response = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ member: 'member-a' })
        .expect(201);
      return {
        token: response.body.accessToken as string,
        defaultBranchId: response.body.user.defaultBranchId as string
      };
    }

    async function branchIdByName(name: string) {
      const branch = await prisma.branch.findFirstOrThrow({ where: { name }, select: { id: true } });
      return branch.id;
    }

    it('scopes member class list by assigned branch', async () => {
      const member = await memberSession();
      const westBranchId = await branchIdByName('城西店');

      await request(app.getHttpServer())
        .get(`/classes?branchId=${westBranchId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .expect(403);

      const eastClasses = await request(app.getHttpServer())
        .get(`/classes?branchId=${member.defaultBranchId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .expect(200);

      expect(eastClasses.body.length).toBeGreaterThan(0);
      expect(
        eastClasses.body.every((boxingClass: { branchId: string }) => boxingClass.branchId === member.defaultBranchId)
      ).toBe(true);
    });

    it('rejects manager creating classes in an unassigned branch', async () => {
      const manager = await adminToken('east-manager', 'manager123456');
      const westBranchId = await branchIdByName('城西店');

      await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${manager}`)
        .send({
          branchId: westBranchId,
          title: '跨店非法课程',
          coach: 'Coach No',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 4,
          description: '东店店长不应能创建西店课程'
        })
        .expect(403);
    });

    it('lets a member list available future scheduled classes', async () => {
      const member = await memberSession();

      const response = await request(app.getHttpServer())
        .get(`/classes?branchId=${member.defaultBranchId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          title: expect.any(String),
          coach: expect.any(String),
          startsAt: expect.any(String),
          capacity: expect.any(Number),
          remainingSpots: expect.any(Number),
          status: 'SCHEDULED'
        })
      );
    });

    it('hides canceled and already started classes from the member class list', async () => {
      const member = await memberSession();
      const branch = await prisma.branch.findUniqueOrThrow({
        where: { id: member.defaultBranchId },
        select: { id: true, gymId: true }
      });

      const canceledClass = await prisma.boxingClass.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          title: '用户端隐藏取消课程',
          coachNameSnapshot: 'Coach Hidden',
          startsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          durationMin: 60,
          capacity: 4,
          status: ClassStatus.CANCELED,
          description: '取消课程不应出现在用户端可预约列表'
        }
      });
      const startedClass = await prisma.boxingClass.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          title: '用户端隐藏已开课课程',
          coachNameSnapshot: 'Coach Hidden',
          startsAt: new Date(Date.now() - 15 * 60 * 1000),
          durationMin: 60,
          capacity: 4,
          status: ClassStatus.SCHEDULED,
          description: '已开课课程不应出现在用户端可预约列表'
        }
      });

      const response = await request(app.getHttpServer())
        .get(`/classes?branchId=${member.defaultBranchId}`)
        .set('Authorization', `Bearer ${member.token}`)
        .expect(200);
      const classIds = response.body.map((item: { id: string }) => item.id);

      expect(classIds).not.toContain(canceledClass.id);
      expect(classIds).not.toContain(startedClass.id);
      expect(
        response.body.every(
          (item: { startsAt: string; status: string }) =>
            item.status === 'SCHEDULED' && new Date(item.startsAt).getTime() > Date.now()
        )
      ).toBe(true);
    });

    it('lets an admin create a class that appears in the member class list', async () => {
      const admin = await adminToken();
      const member = await userToken();

      const created = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId: await branchIdByName('城东店'),
          title: '测试拳课',
          coach: 'Coach Test',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 4,
          description: '管理员创建的测试课程'
        })
        .expect(201);

      expect(created.body).toMatchObject({
        title: '测试拳课',
        coach: 'Coach Test',
        capacity: 4,
        remainingSpots: 4,
        status: 'SCHEDULED'
      });

      const classes = await request(app.getHttpServer())
        .get(`/classes?branchId=${await branchIdByName('城东店')}`)
        .set('Authorization', `Bearer ${member}`)
        .expect(200);

      expect(classes.body.some((item: { id: string }) => item.id === created.body.id)).toBe(true);
    });

    it('marks classes already booked by the current member', async () => {
      const admin = await adminToken();
      const member = await userToken();
      const otherMember = await userToken('member-c');
      const branchId = await branchIdByName('城东店');

      const created = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: '已预约标记课程',
          coach: 'Coach Booked',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 3,
          description: '课程列表需要标记当前会员是否已预约'
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${member}`)
        .send({ classId: created.body.id, branchId })
        .expect(201);

      const bookedClasses = await request(app.getHttpServer())
        .get(`/classes?branchId=${branchId}`)
        .set('Authorization', `Bearer ${member}`)
        .expect(200);
      const bookedClass = bookedClasses.body.find((item: { id: string }) => item.id === created.body.id);
      expect(bookedClass).toMatchObject({
        id: created.body.id,
        bookedCount: 1,
        remainingSpots: 2,
        isBookedByMe: true
      });

      const otherClasses = await request(app.getHttpServer())
        .get(`/classes?branchId=${branchId}`)
        .set('Authorization', `Bearer ${otherMember}`)
        .expect(200);
      const otherClass = otherClasses.body.find((item: { id: string }) => item.id === created.body.id);
      expect(otherClass).toMatchObject({
        id: created.body.id,
        isBookedByMe: false
      });
    });

    it('rejects invalid admin class details before saving', async () => {
      const admin = await adminToken();
      const branchId = await branchIdByName('城东店');

      const pastClass = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: '过去课程',
          coach: 'Coach Past',
          startsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          durationMin: 60,
          capacity: 4,
          description: '不应允许创建过去时间的课程'
        })
        .expect(400);
      expect(pastClass.body.message).toBe('Class start time must be in the future');

      const longDescription = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: '说明过长课程',
          coach: 'Coach Long',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 4,
          description: 'x'.repeat(501)
        })
        .expect(400);
      expect(longDescription.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('description must be shorter than or equal to 500 characters')])
      );
    });

    it('rejects reducing class capacity below active bookings', async () => {
      const admin = await adminToken();
      const member = await userToken();
      const memberC = await userToken('member-c');
      const branchId = await branchIdByName('城东店');

      const created = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: '容量保护课程',
          coach: 'Coach Capacity',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 4,
          description: '已有预约时不能把容量改到预约数以下'
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${member}`)
        .send({ classId: created.body.id, branchId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberC}`)
        .send({ classId: created.body.id, branchId })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/admin/classes/${created.body.id}`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ capacity: 1 })
        .expect(400);
      expect(updated.body.message).toBe('Class capacity cannot be lower than active bookings');
    });

    it('rejects a member creating admin classes', async () => {
      const member = await userToken();

      await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${member}`)
        .send({
          title: '非法课程',
          coach: 'Coach No',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 4,
          description: '普通用户不应能创建课程'
        })
        .expect(403);
    });

    it('lets an admin edit and cancel a class', async () => {
      const admin = await adminToken();

      const created = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId: await branchIdByName('城东店'),
          title: '待编辑课程',
          coach: 'Coach Edit',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 5,
          description: '编辑前'
        })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/admin/classes/${created.body.id}`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ capacity: 7, description: '编辑后' })
        .expect(200);

      expect(updated.body).toMatchObject({
        id: created.body.id,
        capacity: 7,
        description: '编辑后'
      });

      const updateAuditLog = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'CLASS_UPDATE', entityId: created.body.id }
      });
      expect(updateAuditLog.message).toBe('编辑课程：待编辑课程');

      const canceled = await request(app.getHttpServer())
        .post(`/admin/classes/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      expect(canceled.body).toMatchObject({
        id: created.body.id,
        status: 'CANCELED'
      });
    });

    it('cancels active bookings, skips pending reminders, and creates class cancellation notification jobs', async () => {
      const admin = await adminToken();
      const member = await userToken();
      const memberC = await userToken('member-c');
      const branchId = await branchIdByName('城东店');

      const created = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: '课程取消联动测试',
          coach: 'Coach Cancel',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 5,
          description: '取消课程时需要同步处理预约和提醒'
        })
        .expect(201);

      const bookingWithReminder = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${member}`)
        .send({ classId: created.body.id, branchId, remindBeforeMinutes: 120 })
        .expect(201);

      const bookingWithoutReminder = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberC}`)
        .send({ classId: created.body.id, branchId })
        .expect(201);

      await prisma.notificationJob.findFirstOrThrow({
        where: { bookingId: bookingWithReminder.body.id, status: 'PENDING' }
      });

      const canceled = await request(app.getHttpServer())
        .post(`/admin/classes/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      expect(canceled.body).toMatchObject({
        id: created.body.id,
        status: 'CANCELED',
        bookedCount: 0,
        remainingSpots: 5
      });

      const bookings = await prisma.booking.findMany({
        where: { id: { in: [bookingWithReminder.body.id, bookingWithoutReminder.body.id] } },
        orderBy: { createdAt: 'asc' }
      });
      expect(bookings.map((booking) => booking.status)).toEqual(['CANCELED', 'CANCELED']);
      expect(bookings.every((booking) => booking.canceledAt !== null)).toBe(true);

      const reminder = await prisma.notificationJob.findFirstOrThrow({
        where: { bookingId: bookingWithReminder.body.id, type: 'CLASS_REMINDER' }
      });
      expect(reminder.status).toBe('SKIPPED');

      const cancellationJobs = await prisma.notificationJob.findMany({
        where: {
          bookingId: { in: [bookingWithReminder.body.id, bookingWithoutReminder.body.id] },
          type: 'CLASS_CANCELED'
        },
        orderBy: { createdAt: 'asc' }
      });
      expect(cancellationJobs).toHaveLength(2);
      expect(cancellationJobs.map((job) => job.status)).toEqual(['PENDING', 'PENDING']);
      expect(cancellationJobs.every((job) => job.scheduledAt.getTime() <= Date.now())).toBe(true);

      const cancelAuditLog = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'CLASS_CANCEL', entityId: created.body.id }
      });
      expect(cancelAuditLog.metadata).toMatchObject({
        affectedBookingCount: 2,
        notificationJobCount: 2
      });
    });

    it('creates class reschedule notification jobs and moves pending reminders', async () => {
      const admin = await adminToken();
      const member = await userToken();
      const memberC = await userToken('member-c');
      const branchId = await branchIdByName('城东店');
      const originalStartsAt = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);
      const rescheduledStartsAt = new Date(originalStartsAt.getTime() + 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000);

      const created = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: '课程改期联动测试',
          coach: 'Coach Reschedule',
          startsAt: originalStartsAt.toISOString(),
          durationMin: 60,
          capacity: 5,
          description: '改期时需要同步通知会员并移动提醒'
        })
        .expect(201);

      const bookingWithReminder = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${member}`)
        .send({ classId: created.body.id, branchId, remindBeforeMinutes: 120 })
        .expect(201);

      const bookingWithoutReminder = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberC}`)
        .send({ classId: created.body.id, branchId })
        .expect(201);

      const originalReminder = await prisma.notificationJob.findFirstOrThrow({
        where: { bookingId: bookingWithReminder.body.id, type: 'CLASS_REMINDER', status: 'PENDING' }
      });

      await request(app.getHttpServer())
        .patch(`/admin/classes/${created.body.id}`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ startsAt: rescheduledStartsAt.toISOString() })
        .expect(200);

      const movedReminder = await prisma.notificationJob.findUniqueOrThrow({
        where: { id: originalReminder.id }
      });
      expect(movedReminder.scheduledAt.getTime()).toBe(rescheduledStartsAt.getTime() - 120 * 60 * 1000);

      const rescheduleJobs = await prisma.notificationJob.findMany({
        where: {
          bookingId: { in: [bookingWithReminder.body.id, bookingWithoutReminder.body.id] },
          type: 'CLASS_RESCHEDULED'
        },
        orderBy: { createdAt: 'asc' }
      });
      expect(rescheduleJobs).toHaveLength(2);
      expect(rescheduleJobs.map((job) => job.status)).toEqual(['PENDING', 'PENDING']);
      expect(rescheduleJobs.every((job) => job.scheduledAt.getTime() <= Date.now())).toBe(true);

      const updateAuditLog = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'CLASS_UPDATE', entityId: created.body.id },
        orderBy: { createdAt: 'desc' }
      });
      expect(updateAuditLog.metadata).toMatchObject({
        updatedFields: ['startsAt'],
        affectedBookingCount: 2,
        rescheduleNotificationJobCount: 2,
        reminderJobRescheduledCount: 1
      });
    });
  });

  describe('coaches', () => {
    const futureIso = () => new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString();

    async function adminToken(username = 'admin', password = 'admin123456') {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken(member: 'member-a' | 'member-c' = 'member-a') {
      const response = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ member })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function branchIdByName(name: string) {
      const branch = await prisma.branch.findFirstOrThrow({ where: { name }, select: { id: true } });
      return branch.id;
    }

    async function createCoachFixture(branchId: string, suffix = `${Date.now()}-${Math.random()}`) {
      const admin = await adminToken();
      const username = `coach-${suffix}`.slice(0, 60);
      const response = await request(app.getHttpServer())
        .post('/admin/coaches')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          displayName: `教练${suffix}`,
          nickname: `Coach ${suffix}`,
          username,
          password: 'coach123456',
          phone: `188${String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8)}`
        })
        .expect(201);
      return { coach: response.body as { id: string; username: string; nickname: string }, password: 'coach123456' };
    }

    it('lets admins create, list, and disable coaches', async () => {
      const admin = await adminToken();
      const eastBranchId = await branchIdByName('城东店');
      const westBranchId = await branchIdByName('城西店');
      const username = `coach-ming-${Date.now()}`;

      const created = await request(app.getHttpServer())
        .post('/admin/coaches')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId: eastBranchId,
          displayName: '王明',
          nickname: 'Ming Coach',
          username,
          password: 'coach123456',
          phone: '18812345678'
        })
        .expect(201);

      expect(created.body).toMatchObject({
        displayName: '王明',
        nickname: 'Ming Coach',
        username,
        branchId: eastBranchId,
        branchName: '城东店',
        status: 'ACTIVE'
      });

      const listed = await request(app.getHttpServer())
        .get(`/admin/coaches?branchId=${eastBranchId}`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(listed.body.some((coach: { id: string }) => coach.id === created.body.id)).toBe(true);

      const disabled = await request(app.getHttpServer())
        .patch(`/admin/coaches/${created.body.id}`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ branchId: eastBranchId, status: 'DISABLED', nickname: '明教练' })
        .expect(200);
      expect(disabled.body).toMatchObject({ id: created.body.id, nickname: '明教练', status: 'DISABLED' });

      const eastManager = await adminToken('east-manager', 'manager123456');
      await request(app.getHttpServer())
        .post('/admin/coaches')
        .set('Authorization', `Bearer ${eastManager}`)
        .send({
          branchId: westBranchId,
          displayName: '越权教练',
          nickname: '越权',
          username: `coach-forbidden-${Date.now()}`,
          password: 'coach123456'
        })
        .expect(403);

      const member = await userToken();
      await request(app.getHttpServer())
        .get('/admin/coaches')
        .set('Authorization', `Bearer ${member}`)
        .expect(403);
    });

    it('enforces coach role view and operation boundaries', async () => {
      const admin = await adminToken();
      const eastBranchId = await branchIdByName('城东店');
      const { coach, password } = await createCoachFixture(eastBranchId, `boundary-${Date.now()}`);
      const other = await createCoachFixture(eastBranchId, `other-${Date.now()}`);

      const ownClass = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId: eastBranchId,
          coachId: coach.id,
          title: '教练本人课程',
          coach: coach.nickname,
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 5,
          description: '教练只能看到自己的课程'
        })
        .expect(201);

      const otherClass = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId: eastBranchId,
          coachId: other.coach.id,
          title: '其他教练课程',
          coach: other.coach.nickname,
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 5,
          description: '教练不应看到其他教练课程'
        })
        .expect(201);

      const member = await userToken('member-a');
      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${member}`)
        .send({ classId: ownClass.body.id, branchId: eastBranchId })
        .expect(201);

      const coachLogin = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username: coach.username, password })
        .expect(201);
      const coachToken = coachLogin.body.accessToken as string;

      const coachClasses = await request(app.getHttpServer())
        .get(`/admin/classes?branchId=${eastBranchId}`)
        .set('Authorization', `Bearer ${coachToken}`)
        .expect(200);
      expect(coachClasses.body.map((item: { id: string }) => item.id)).toContain(ownClass.body.id);
      expect(coachClasses.body.map((item: { id: string }) => item.id)).not.toContain(otherClass.body.id);

      const coachBookings = await request(app.getHttpServer())
        .get(`/admin/bookings?branchId=${eastBranchId}`)
        .set('Authorization', `Bearer ${coachToken}`)
        .expect(200);
      expect(coachBookings.body.map((item: { id: string }) => item.id)).toContain(booking.body.id);
      expect(coachBookings.body.every((item: { boxingClass: { coachId: string } }) => item.boxingClass.coachId === coach.id)).toBe(true);

      await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${coachToken}`)
        .send({
          branchId: eastBranchId,
          title: '教练越权创建',
          coach: coach.nickname,
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 5,
          description: '教练不能创建课程'
        })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/admin/bookings/${booking.body.id}/deduct`)
        .set('Authorization', `Bearer ${coachToken}`)
        .send({ note: '教练不能消课' })
        .expect(403);
    });
  });

  describe('bookings', () => {
    const futureIso = () => new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

    function restoreEnv(key: string, value: string | undefined) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    async function adminToken(username = 'admin', password = 'admin123456') {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function memberSession(member: 'member-a' | 'member-b' | 'member-c' = 'member-a') {
      const response = await request(app.getHttpServer()).post('/auth/dev-login').send({ member }).expect(201);
      return {
        token: response.body.accessToken as string,
        defaultBranchId: response.body.user.defaultBranchId as string
      };
    }

    async function userToken(member: 'member-a' | 'member-b' | 'member-c' = 'member-a') {
      return (await memberSession(member)).token;
    }

    async function branchIdByName(name: string) {
      const branch = await prisma.branch.findFirstOrThrow({ where: { name }, select: { id: true } });
      return branch.id;
    }

    async function createClass(capacity = 4, branchName = '城东店', startsAt = futureIso()) {
      const admin = await adminToken();
      const branchId = await branchIdByName(branchName);
      const response = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: `预约测试 ${Date.now()} ${Math.random()}`,
          coach: 'Coach Booking',
          startsAt,
          durationMin: 60,
          capacity,
          description: '预约测试课程'
        })
        .expect(201);
      return response.body as { id: string; branchId: string };
    }

    it('rejects a member booking a class outside their branch', async () => {
      const boxingClass = await createClass(4, '城西店');
      const memberA = await memberSession('member-a');

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA.token}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        .expect(403);
    });

    it('rejects mismatched booking branch and class branch', async () => {
      const boxingClass = await createClass(4, '城东店');
      const memberB = await memberSession('member-b');

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberB.token}`)
        .send({ classId: boxingClass.id, branchId: memberB.defaultBranchId })
        .expect(400);
    });

    it('scopes member booking list by branch', async () => {
      const boxingClass = await createClass();
      const memberA = await memberSession('member-a');
      const westBranchId = await branchIdByName('城西店');

      const created = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA.token}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        .expect(201);

      const branchScopedBookings = await request(app.getHttpServer())
        .get(`/bookings/me?branchId=${memberA.defaultBranchId}`)
        .set('Authorization', `Bearer ${memberA.token}`)
        .expect(200);

      expect(branchScopedBookings.body.some((item: { id: string }) => item.id === created.body.id)).toBe(true);
      expect(
        branchScopedBookings.body.every(
          (booking: { boxingClass: { branchId: string } }) => booking.boxingClass.branchId === memberA.defaultBranchId
        )
      ).toBe(true);

      await request(app.getHttpServer())
        .get(`/bookings/me?branchId=${westBranchId}`)
        .set('Authorization', `Bearer ${memberA.token}`)
        .expect(403);
    });

    it('lets a member book a class and see only their own booking', async () => {
      const boxingClass = await createClass();
      const memberA = await userToken('member-a');
      const memberC = await userToken('member-c');

      const created = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        .expect(201);

      expect(created.body).toMatchObject({
        id: expect.any(String),
        status: 'BOOKED',
        attendanceStatus: 'PENDING',
        boxingClass: { id: boxingClass.id }
      });

      const memberABookings = await request(app.getHttpServer())
        .get(`/bookings/me?branchId=${boxingClass.branchId}`)
        .set('Authorization', `Bearer ${memberA}`)
        .expect(200);
      expect(memberABookings.body.some((item: { id: string }) => item.id === created.body.id)).toBe(true);

      const memberCBookings = await request(app.getHttpServer())
        .get(`/bookings/me?branchId=${boxingClass.branchId}`)
        .set('Authorization', `Bearer ${memberC}`)
        .expect(200);
      expect(memberCBookings.body.some((item: { id: string }) => item.id === created.body.id)).toBe(false);
    });

    it('creates a configurable booking confirmation notification job', async () => {
      const originalTemplateId = process.env.WECHAT_BOOKING_CREATED_TEMPLATE_ID;
      process.env.WECHAT_BOOKING_CREATED_TEMPLATE_ID = 'booking-created-template';

      try {
        const boxingClass = await createClass();
        const memberA = await userToken('member-a');

        const created = await request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${memberA}`)
          .send({
            classId: boxingClass.id,
            branchId: boxingClass.branchId,
            bookingConfirmationSubscribed: true
          })
          .expect(201);

        const jobs = await prisma.notificationJob.findMany({
          where: { bookingId: created.body.id },
          orderBy: { createdAt: 'asc' }
        });
        const confirmationJob = jobs.find((job) => job.type === 'BOOKING_CREATED');

        expect(confirmationJob).toMatchObject({
          type: 'BOOKING_CREATED',
          status: 'PENDING',
          templateId: 'booking-created-template'
        });
        expect(confirmationJob?.scheduledAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

        const admin = await adminToken();
        const notifications = await request(app.getHttpServer())
          .get(`/admin/notifications?branchId=${boxingClass.branchId}`)
          .set('Authorization', `Bearer ${admin}`)
          .expect(200);
        expect(notifications.body.find((job: { id: string }) => job.id === confirmationJob?.id)).toMatchObject({
          type: 'BOOKING_CREATED',
          templateId: 'booking-created-template'
        });
      } finally {
        restoreEnv('WECHAT_BOOKING_CREATED_TEMPLATE_ID', originalTemplateId);
      }
    });

    it('rejects duplicate active booking for the same class', async () => {
      const boxingClass = await createClass();
      const memberA = await userToken('member-a');

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        .expect(409);
    });

    it('enforces class capacity', async () => {
      const boxingClass = await createClass(1);
      const memberA = await userToken('member-a');
      const memberC = await userToken('member-c');

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberC}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        .expect(409);
    });

    it('prevents concurrent bookings from exceeding class capacity', async () => {
      const boxingClass = await createClass(1);

      const sessions = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          request(app.getHttpServer())
            .post('/auth/wechat-login')
            .send({ code: `mock:capacity-race-${index}` })
            .expect(201)
        )
      );

      const responses = await Promise.all(
        sessions.map((session) =>
          request(app.getHttpServer())
            .post('/bookings')
            .set('Authorization', `Bearer ${session.body.accessToken}`)
            .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        )
      );

      expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
      expect(responses.filter((response) => response.status === 409)).toHaveLength(7);

      const activeBookings = await prisma.booking.count({
        where: { classId: boxingClass.id, status: 'BOOKED' }
      });
      expect(activeBookings).toBe(1);
    });

    it('lets a member cancel only their own booking before class start', async () => {
      const boxingClass = await createClass();
      const memberA = await userToken('member-a');
      const memberC = await userToken('member-c');

      const created = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/bookings/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${memberC}`)
        .expect(403);

      const canceled = await request(app.getHttpServer())
        .post(`/bookings/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${memberA}`)
        .expect(200);

      expect(canceled.body).toMatchObject({
        id: created.body.id,
        status: 'CANCELED'
      });
    });

    it('rejects member cancellation inside the cutoff window', async () => {
      const startsAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();
      const boxingClass = await createClass(4, '城东店', startsAt);
      const memberA = await userToken('member-a');

      const created = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId })
        .expect(201);

      const mine = await request(app.getHttpServer())
        .get(`/bookings/me?branchId=${boxingClass.branchId}`)
        .set('Authorization', `Bearer ${memberA}`)
        .expect(200);
      expect(mine.body.find((item: { id: string }) => item.id === created.body.id)?.canCancel).toBe(false);

      await request(app.getHttpServer())
        .post(`/bookings/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${memberA}`)
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe('Booking can only be canceled at least 2 hours before class starts');
        });

      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(booking.status).toBe('BOOKED');
      expect(booking.canceledAt).toBeNull();
    });

    it('creates a notification job when a member requests a reminder', async () => {
      const boxingClass = await createClass();
      const memberA = await userToken('member-a');

      const created = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId, remindBeforeMinutes: 120 })
        .expect(201);

      const jobs = await prisma.notificationJob.findMany({
        where: { bookingId: created.body.id }
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        bookingId: created.body.id,
        branchId: boxingClass.branchId,
        type: 'CLASS_REMINDER',
        status: 'PENDING'
      });
    });

    it('skips pending notification jobs when a member cancels before the cutoff', async () => {
      const boxingClass = await createClass();
      const memberA = await userToken('member-a');

      const created = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id, branchId: boxingClass.branchId, remindBeforeMinutes: 120 })
        .expect(201);

      await prisma.notificationJob.findFirstOrThrow({
        where: { bookingId: created.body.id, status: 'PENDING' }
      });

      await request(app.getHttpServer())
        .post(`/bookings/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${memberA}`)
        .expect(200);

      const jobs = await prisma.notificationJob.findMany({
        where: { bookingId: created.body.id },
        orderBy: { createdAt: 'asc' }
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('SKIPPED');
    });

    it('lets an auto-provisioned WeChat member book with reminder and be deducted by admin', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/wechat-login')
        .send({ code: 'mock:openid-flow-001' })
        .expect(201);
      const memberToken = login.body.accessToken as string;
      const branchId = login.body.user.defaultBranchId as string;
      const admin = await adminToken();

      const boxingClass = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: `微信测试约课 ${Date.now()} ${Math.random()}`,
          coach: 'Coach WeChat',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 5,
          description: '微信真实账号测试课程'
        })
        .expect(201);

      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ classId: boxingClass.body.id, branchId, remindBeforeMinutes: 120 })
        .expect(201);

      const jobs = await prisma.notificationJob.findMany({ where: { bookingId: booking.body.id } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ branchId, userId: login.body.user.id, status: 'PENDING' });

      await request(app.getHttpServer())
        .post(`/admin/bookings/${booking.body.id}/deduct`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ note: '微信账号测试消课' })
        .expect(201);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);
      expect(me.body.lessonBalance.remaining).toBe(9);
    });
  });

  describe('notifications', () => {
    function restoreEnv(key: string, value: string | undefined) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    async function adminToken(username = 'admin', password = 'admin123456') {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken(member: 'member-a' | 'member-b' | 'member-c' = 'member-a') {
      const response = await request(app.getHttpServer()).post('/auth/dev-login').send({ member }).expect(201);
      return response.body.accessToken as string;
    }

    async function createPendingReminderJob(
      templateId: string | null,
      branchName = '城东店',
      memberPhone = '18800000001'
    ) {
      const branch = await prisma.branch.findFirstOrThrow({ where: { name: branchName } });
      const member = await prisma.user.findUniqueOrThrow({ where: { phone: memberPhone } });
      const boxingClass = await prisma.boxingClass.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          title: `提醒发送测试 ${Date.now()} ${Math.random()}`,
          coachNameSnapshot: 'Coach Notify',
          startsAt: new Date('2030-01-02T11:00:00.000Z'),
          durationMin: 60,
          capacity: 5,
          description: '提醒发送测试课程'
        }
      });
      const booking = await prisma.booking.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          userId: member.id,
          classId: boxingClass.id
        }
      });
      const job = await prisma.notificationJob.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          bookingId: booking.id,
          userId: member.id,
          type: 'CLASS_REMINDER',
          scheduledAt: new Date(Date.now() - 60_000),
          templateId
        }
      });

      return { branch, member, boxingClass, booking, job };
    }

    async function skipExistingPendingNotificationJobs() {
      await prisma.notificationJob.updateMany({
        where: { status: 'PENDING' },
        data: { status: 'SKIPPED' }
      });
    }

    it('lets admins list notification jobs with latest logs scoped by branch', async () => {
      const east = await createPendingReminderJob('template-east', '城东店', '18800000001');
      const west = await createPendingReminderJob('template-west', '城西店', '18800000002');
      await prisma.notificationLog.create({
        data: { jobId: east.job.id, status: 'FAILED', message: 'east notification failed' }
      });
      await prisma.notificationLog.create({
        data: { jobId: west.job.id, status: 'FAILED', message: 'west notification failed' }
      });

      const owner = await adminToken();
      const ownerResponse = await request(app.getHttpServer())
        .get('/admin/notifications')
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);

      expect(ownerResponse.body.some((item: { id: string }) => item.id === east.job.id)).toBe(true);
      expect(ownerResponse.body.some((item: { id: string }) => item.id === west.job.id)).toBe(true);
      expect(ownerResponse.body.find((item: { id: string }) => item.id === east.job.id)).toMatchObject({
        id: east.job.id,
        branchId: east.branch.id,
        branchName: '城东店',
        status: 'PENDING',
        member: { displayName: '阿杰', phone: '18800000001' },
        boxingClass: { title: expect.stringContaining('提醒发送测试') },
        latestLog: { status: 'FAILED', message: 'east notification failed' }
      });

      const eastManager = await adminToken('east-manager', 'manager123456');
      const managerResponse = await request(app.getHttpServer())
        .get('/admin/notifications')
        .set('Authorization', `Bearer ${eastManager}`)
        .expect(200);

      expect(managerResponse.body.some((item: { id: string }) => item.id === east.job.id)).toBe(true);
      expect(managerResponse.body.some((item: { id: string }) => item.id === west.job.id)).toBe(false);
      expect(managerResponse.body.every((item: { branchId: string }) => item.branchId === east.branch.id)).toBe(true);

      await request(app.getHttpServer())
        .get(`/admin/notifications?branchId=${west.branch.id}`)
        .set('Authorization', `Bearer ${eastManager}`)
        .expect(403);

      const member = await userToken('member-a');
      await request(app.getHttpServer())
        .get('/admin/notifications')
        .set('Authorization', `Bearer ${member}`)
        .expect(403);
    });

    it('retries failed notification jobs immediately for accessible admins', async () => {
      const originalSecret = process.env.MINIAPP_APP_SECRET;
      process.env.MINIAPP_APP_SECRET = 'retry-secret';
      const { member, job } = await createPendingReminderJob('template-retry');
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED' }
      });
      await prisma.notificationLog.create({
        data: { jobId: job.id, status: 'FAILED', message: 'previous failure' }
      });
      await prisma.wechatAccount.upsert({
        where: { appId_openid: { appId: 'test-miniapp', openid: 'openid-retry-ajie' } },
        update: { userId: member.id },
        create: {
          appId: 'test-miniapp',
          openid: 'openid-retry-ajie',
          userId: member.id
        }
      });

      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'access-token-retry', expires_in: 7200 })
        } as unknown as Response)
        .mockResolvedValueOnce({
          json: async () => ({ errcode: 0, errmsg: 'ok' })
        } as unknown as Response);

      try {
        const admin = await adminToken();
        const response = await request(app.getHttpServer())
          .post(`/admin/notifications/${job.id}/retry`)
          .set('Authorization', `Bearer ${admin}`)
          .expect(200);

        expect(response.body).toMatchObject({
          id: job.id,
          status: 'SENT',
          latestLog: { status: 'SENT', message: 'Wechat subscribe message sent' }
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const storedJob = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
        expect(storedJob.status).toBe('SENT');
        const logs = await prisma.notificationLog.findMany({
          where: { jobId: job.id },
          orderBy: { createdAt: 'asc' }
        });
        expect(logs.map((log) => log.status)).toEqual(['FAILED', 'SENT']);
      } finally {
        fetchMock.mockRestore();
        restoreEnv('MINIAPP_APP_SECRET', originalSecret);
      }
    });

    it('sends due class reminder jobs through WeChat subscribe messages', async () => {
      await skipExistingPendingNotificationJobs();
      const originalSecret = process.env.MINIAPP_APP_SECRET;
      process.env.MINIAPP_APP_SECRET = 'test-secret';
      const { member, job } = await createPendingReminderJob('template-test');
      await prisma.wechatAccount.upsert({
        where: { appId_openid: { appId: 'test-miniapp', openid: 'openid-notify-ajie' } },
        update: { userId: member.id },
        create: {
          appId: 'test-miniapp',
          openid: 'openid-notify-ajie',
          userId: member.id
        }
      });

      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'access-token-test', expires_in: 7200 })
        } as unknown as Response)
        .mockResolvedValueOnce({
          json: async () => ({ errcode: 0, errmsg: 'ok' })
        } as unknown as Response);

      try {
        const result = await notifications.processDueClassReminders(new Date());

        expect(result).toEqual({ sent: 1, failed: 0, skipped: 0 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain('/cgi-bin/token?grant_type=client_credential');
        expect(String(fetchMock.mock.calls[1][0])).toContain(
          '/cgi-bin/message/subscribe/send?access_token=access-token-test'
        );

        const sendOptions = fetchMock.mock.calls[1][1] as { body: string };
        const payload = JSON.parse(sendOptions.body) as {
          touser: string;
          template_id: string;
          page: string;
          data: Record<string, { value: string }>;
        };
        expect(payload).toMatchObject({
          touser: 'openid-notify-ajie',
          template_id: 'template-test',
          page: 'pages/bookings/index'
        });
        expect(payload.data.thing1.value).toContain('提醒发送测试');
        expect(payload.data.time2.value).toContain('2030-01-02');
        expect(payload.data.thing3.value).toBe('城东店');

        const storedJob = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
        expect(storedJob.status).toBe('SENT');
        const logs = await prisma.notificationLog.findMany({ where: { jobId: job.id } });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ status: 'SENT', message: 'Wechat subscribe message sent' });
      } finally {
        fetchMock.mockRestore();
        restoreEnv('MINIAPP_APP_SECRET', originalSecret);
      }
    });

    it('redacts sensitive details from failed notification logs', async () => {
      await skipExistingPendingNotificationJobs();
      const originalSecret = process.env.MINIAPP_APP_SECRET;
      process.env.MINIAPP_APP_SECRET = 'leaky-secret-value';
      const { member, job } = await createPendingReminderJob('template-redaction');
      await prisma.wechatAccount.upsert({
        where: { appId_openid: { appId: 'test-miniapp', openid: 'openid-redaction-ajie' } },
        update: { userId: member.id },
        create: {
          appId: 'test-miniapp',
          openid: 'openid-redaction-ajie',
          userId: member.id
        }
      });

      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'access-token-redaction', expires_in: 7200 })
        } as unknown as Response)
        .mockResolvedValueOnce({
          json: async () => ({
            errcode: 40003,
            errmsg:
              'invalid openid openid-redaction-ajie access_token=access-token-redaction secret=leaky-secret-value phone=18800000001'
          })
        } as unknown as Response);

      try {
        const result = await notifications.processDueClassReminders(new Date());

        expect(result).toEqual({ sent: 0, failed: 1, skipped: 0 });
        const logs = await prisma.notificationLog.findMany({ where: { jobId: job.id } });
        expect(logs).toHaveLength(1);
        expect(logs[0].message).toContain('Wechat subscribe message failed');
        expect(logs[0].message).not.toContain('openid-redaction-ajie');
        expect(logs[0].message).not.toContain('access-token-redaction');
        expect(logs[0].message).not.toContain('leaky-secret-value');
        expect(logs[0].message).not.toContain('18800000001');
      } finally {
        fetchMock.mockRestore();
        restoreEnv('MINIAPP_APP_SECRET', originalSecret);
      }
    });

    it('uses configured WeChat subscribe data field names', async () => {
      await skipExistingPendingNotificationJobs();
      const originalSecret = process.env.MINIAPP_APP_SECRET;
      const originalTitleField = process.env.WECHAT_SUBSCRIBE_CLASS_TITLE_FIELD;
      const originalTimeField = process.env.WECHAT_SUBSCRIBE_CLASS_TIME_FIELD;
      const originalBranchField = process.env.WECHAT_SUBSCRIBE_BRANCH_FIELD;
      process.env.MINIAPP_APP_SECRET = 'field-secret';
      process.env.WECHAT_SUBSCRIBE_CLASS_TITLE_FIELD = 'thing7';
      process.env.WECHAT_SUBSCRIBE_CLASS_TIME_FIELD = 'time8';
      process.env.WECHAT_SUBSCRIBE_BRANCH_FIELD = 'thing9';

      const { member } = await createPendingReminderJob('template-field-test');
      await prisma.wechatAccount.upsert({
        where: { appId_openid: { appId: 'test-miniapp', openid: 'openid-field-ajie' } },
        update: { userId: member.id },
        create: {
          appId: 'test-miniapp',
          openid: 'openid-field-ajie',
          userId: member.id
        }
      });

      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'access-token-field', expires_in: 7200 })
        } as unknown as Response)
        .mockResolvedValueOnce({
          json: async () => ({ errcode: 0, errmsg: 'ok' })
        } as unknown as Response);

      try {
        await notifications.processDueClassReminders(new Date());

        const sendOptions = fetchMock.mock.calls[1][1] as { body: string };
        const payload = JSON.parse(sendOptions.body) as {
          data: Record<string, { value: string } | undefined>;
        };
        expect(payload.data.thing7?.value).toContain('提醒发送测试');
        expect(payload.data.time8?.value).toContain('2030-01-02');
        expect(payload.data.thing9?.value).toBe('城东店');
        expect(payload.data.thing1).toBeUndefined();
        expect(payload.data.time2).toBeUndefined();
        expect(payload.data.thing3).toBeUndefined();
      } finally {
        fetchMock.mockRestore();
        restoreEnv('MINIAPP_APP_SECRET', originalSecret);
        restoreEnv('WECHAT_SUBSCRIBE_CLASS_TITLE_FIELD', originalTitleField);
        restoreEnv('WECHAT_SUBSCRIBE_CLASS_TIME_FIELD', originalTimeField);
        restoreEnv('WECHAT_SUBSCRIBE_BRANCH_FIELD', originalBranchField);
      }
    });

    it('skips due class reminder jobs without a template id', async () => {
      await skipExistingPendingNotificationJobs();
      const { job } = await createPendingReminderJob(null);
      const fetchMock = jest.spyOn(globalThis, 'fetch');

      try {
        const result = await notifications.processDueClassReminders(new Date());

        expect(result).toEqual({ sent: 0, failed: 0, skipped: 1 });
        expect(fetchMock).not.toHaveBeenCalled();
        const storedJob = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
        expect(storedJob.status).toBe('SKIPPED');
        const logs = await prisma.notificationLog.findMany({ where: { jobId: job.id } });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
          status: 'SKIPPED',
          message: 'Wechat subscribe template id is not configured'
        });
      } finally {
        fetchMock.mockRestore();
      }
    });
  });

  describe('admin bookings and lesson deductions', () => {
    const futureIso = () => new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();

    async function adminToken(username = 'admin', password = 'admin123456') {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken(member: 'member-a' | 'member-b' = 'member-a') {
      const response = await request(app.getHttpServer()).post('/auth/dev-login').send({ member }).expect(201);
      return response.body.accessToken as string;
    }

    async function branchIdByName(name: string) {
      const branch = await prisma.branch.findFirstOrThrow({ where: { name }, select: { id: true } });
      return branch.id;
    }

    async function createBookedClass(
      member: 'member-a' | 'member-b' = 'member-a',
      options: { remindBeforeMinutes?: number } = {}
    ) {
      const admin = await adminToken();
      const user = await userToken(member);
      const branchId = await branchIdByName(member === 'member-a' ? '城东店' : '城西店');
      const boxingClass = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: `消课测试 ${Date.now()} ${Math.random()}`,
          coach: 'Coach Deduct',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 5,
          description: '消课测试课程'
        })
        .expect(201);

      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${user}`)
        .send({ classId: boxingClass.body.id, branchId, ...options })
        .expect(201);

      return { bookingId: booking.body.id, classId: boxingClass.body.id, branchId };
    }

    it('filters admin booking dates by the configured business timezone', async () => {
      const admin = await adminToken();
      const memberA = await userToken('member-a');
      const eastBranchId = await branchIdByName('城东店');
      const boxingClass = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId: eastBranchId,
          title: '本地日期筛选测试',
          coach: 'Coach Date',
          startsAt: '2030-01-01T16:30:00.000Z',
          durationMin: 60,
          capacity: 5,
          description: 'UTC+8 下属于 2030-01-02 的课程'
        })
        .expect(201);

      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.body.id, branchId: eastBranchId })
        .expect(201);

      const localDateBookings = await request(app.getHttpServer())
        .get(`/admin/bookings?branchId=${eastBranchId}&date=2030-01-02`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(localDateBookings.body.some((item: { id: string }) => item.id === booking.body.id)).toBe(true);

      const previousUtcDateBookings = await request(app.getHttpServer())
        .get(`/admin/bookings?branchId=${eastBranchId}&date=2030-01-01`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(previousUtcDateBookings.body.some((item: { id: string }) => item.id === booking.body.id)).toBe(false);
    });

    it('scopes admin booking lists by staff branch assignment', async () => {
      const eastBooking = await createBookedClass('member-a');
      const westBooking = await createBookedClass('member-b');
      const owner = await adminToken();
      const eastManager = await adminToken('east-manager', 'manager123456');
      const eastBranchId = await branchIdByName('城东店');
      const westBranchId = await branchIdByName('城西店');

      const managerBookings = await request(app.getHttpServer())
        .get(`/admin/bookings?branchId=${eastBranchId}`)
        .set('Authorization', `Bearer ${eastManager}`)
        .expect(200);

      expect(managerBookings.body.some((item: { id: string }) => item.id === eastBooking.bookingId)).toBe(true);
      expect(managerBookings.body.some((item: { id: string }) => item.id === westBooking.bookingId)).toBe(false);
      expect(
        managerBookings.body.every(
          (booking: { boxingClass: { branchId: string } }) => booking.boxingClass.branchId === eastBranchId
        )
      ).toBe(true);

      await request(app.getHttpServer())
        .get(`/admin/bookings?branchId=${westBranchId}`)
        .set('Authorization', `Bearer ${eastManager}`)
        .expect(403);

      const ownerBookings = await request(app.getHttpServer())
        .get('/admin/bookings')
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);

      expect(ownerBookings.body.some((item: { id: string }) => item.id === eastBooking.bookingId)).toBe(true);
      expect(ownerBookings.body.some((item: { id: string }) => item.id === westBooking.bookingId)).toBe(true);
    });

    it('rejects managers deducting bookings outside assigned branches', async () => {
      const { bookingId } = await createBookedClass('member-b');
      const eastManager = await adminToken('east-manager', 'manager123456');

      await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/deduct`)
        .set('Authorization', `Bearer ${eastManager}`)
        .send({ note: '跨店非法消课' })
        .expect(403);
    });

    it('cancels an active booking from the admin roster', async () => {
      const { bookingId, branchId } = await createBookedClass('member-a', { remindBeforeMinutes: 120 });
      const admin = await adminToken();

      const canceled = await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ reason: '会员临时请假' })
        .expect(200);

      expect(canceled.body).toMatchObject({
        id: bookingId,
        status: 'CANCELED',
        attendanceStatus: 'PENDING',
        deductionId: null,
        boxingClass: { branchId }
      });
      expect(canceled.body.canceledAt).toBeTruthy();

      const jobs = await prisma.notificationJob.findMany({ where: { bookingId } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('SKIPPED');

      await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/deduct`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ note: '取消后不能消课' })
        .expect(400);

      const auditLog = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'BOOKING_CANCEL', entityType: 'Booking', entityId: bookingId }
      });
      expect(auditLog.branchId).toBe(branchId);
      expect(auditLog.message).toContain('取消预约');
      expect(auditLog.metadata).toMatchObject({
        memberId: expect.any(String),
        reason: '会员临时请假'
      });
    });

    it('rejects member and cross-branch manager booking cancel attempts', async () => {
      const { bookingId } = await createBookedClass('member-b');
      const memberB = await userToken('member-b');
      const eastManager = await adminToken('east-manager', 'manager123456');

      await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${memberB}`)
        .send({ reason: '会员不能调用后台取消' })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${eastManager}`)
        .send({ reason: '跨店非法取消' })
        .expect(403);
    });

    it('lets an admin list bookings and rejects a member from the admin list', async () => {
      const { bookingId } = await createBookedClass();
      const admin = await adminToken();
      const member = await userToken('member-a');

      const response = await request(app.getHttpServer())
        .get('/admin/bookings')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      expect(response.body.some((item: { id: string }) => item.id === bookingId)).toBe(true);

      await request(app.getHttpServer())
        .get('/admin/bookings')
        .set('Authorization', `Bearer ${member}`)
        .expect(403);
    });

    it('lets an admin deduct a lesson and decrement member balance', async () => {
      const { bookingId } = await createBookedClass('member-a');
      const admin = await adminToken();
      const memberA = await userToken('member-a');

      const deducted = await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/deduct`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ note: '到店上课' })
        .expect(201);

      expect(deducted.body).toMatchObject({
        bookingId,
        amount: 1,
        note: '到店上课'
      });

      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.attendanceStatus).toBe('ATTENDED');

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${memberA}`)
        .expect(200);
      expect(me.body.lessonBalance.remaining).toBe(9);
    });

    it('rejects duplicate deductions and member deduction attempts', async () => {
      const { bookingId } = await createBookedClass('member-a');
      const admin = await adminToken();
      const memberA = await userToken('member-a');

      await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/deduct`)
        .set('Authorization', `Bearer ${memberA}`)
        .send({ note: '非法消课' })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/deduct`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ note: '第一次消课' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/deduct`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ note: '重复消课' })
        .expect(409);
    });

    it('returns member-only and admin-wide deduction records', async () => {
      const { bookingId } = await createBookedClass('member-a');
      const admin = await adminToken();
      const memberA = await userToken('member-a');
      const memberB = await userToken('member-b');

      const deducted = await request(app.getHttpServer())
        .post(`/admin/bookings/${bookingId}/deduct`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ note: '记录检查' })
        .expect(201);

      const mine = await request(app.getHttpServer())
        .get(`/deductions/me?branchId=${await branchIdByName('城东店')}`)
        .set('Authorization', `Bearer ${memberA}`)
        .expect(200);
      expect(mine.body.some((item: { id: string }) => item.id === deducted.body.id)).toBe(true);

      const otherMember = await request(app.getHttpServer())
        .get(`/deductions/me?branchId=${await branchIdByName('城西店')}`)
        .set('Authorization', `Bearer ${memberB}`)
        .expect(200);
      expect(otherMember.body.some((item: { id: string }) => item.id === deducted.body.id)).toBe(false);

      await request(app.getHttpServer())
        .get(`/deductions/me?branchId=${await branchIdByName('城西店')}`)
        .set('Authorization', `Bearer ${memberA}`)
        .expect(403);

      const all = await request(app.getHttpServer())
        .get('/admin/deductions')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(all.body.some((item: { id: string }) => item.id === deducted.body.id)).toBe(true);

      const manager = await adminToken('east-manager', 'manager123456');
      const managerDeductions = await request(app.getHttpServer())
        .get(`/admin/deductions?branchId=${await branchIdByName('城东店')}`)
        .set('Authorization', `Bearer ${manager}`)
        .expect(200);
      expect(managerDeductions.body.some((item: { id: string }) => item.id === deducted.body.id)).toBe(true);
    });
  });

  describe('admin metrics', () => {
    async function adminToken(username = 'admin', password = 'admin123456') {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken(member: 'member-a' | 'member-b' = 'member-a') {
      const response = await request(app.getHttpServer()).post('/auth/dev-login').send({ member }).expect(201);
      return response.body.accessToken as string;
    }

    async function branchIdByName(name: string) {
      const branch = await prisma.branch.findFirstOrThrow({ where: { name }, select: { id: true } });
      return branch.id;
    }

    async function seedDailyMetricData(branchId: string) {
      const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
      const admin = await prisma.user.findFirstOrThrow({ where: { username: 'admin' } });
      const memberA = await prisma.user.findFirstOrThrow({ where: { phone: '18800000001' } });
      const memberC = await prisma.user.findFirstOrThrow({ where: { phone: '18800000003' } });
      const metricCreatedAt = new Date('2030-02-03T02:00:00.000Z');

      const fullClass = await prisma.boxingClass.create({
        data: {
          gymId: branch.gymId,
          branchId,
          title: '指标满员课程',
          coachNameSnapshot: 'Coach Metrics',
          startsAt: new Date('2030-02-03T03:00:00.000Z'),
          durationMin: 60,
          capacity: 1,
          description: '运营指标测试满员课程'
        }
      });
      const openClass = await prisma.boxingClass.create({
        data: {
          gymId: branch.gymId,
          branchId,
          title: '指标取消课程',
          coachNameSnapshot: 'Coach Metrics',
          startsAt: new Date('2030-02-03T04:00:00.000Z'),
          durationMin: 60,
          capacity: 2,
          description: '运营指标测试取消课程'
        }
      });

      const activeBooking = await prisma.booking.create({
        data: {
          gymId: branch.gymId,
          branchId,
          userId: memberA.id,
          classId: fullClass.id,
          status: BookingStatus.BOOKED,
          attendanceStatus: AttendanceStatus.ATTENDED,
          createdAt: metricCreatedAt
        }
      });
      await prisma.booking.create({
        data: {
          gymId: branch.gymId,
          branchId,
          userId: memberC.id,
          classId: openClass.id,
          status: BookingStatus.CANCELED,
          attendanceStatus: AttendanceStatus.PENDING,
          canceledAt: metricCreatedAt,
          createdAt: metricCreatedAt
        }
      });
      await prisma.lessonDeduction.create({
        data: {
          gymId: branch.gymId,
          branchId,
          bookingId: activeBooking.id,
          userId: memberA.id,
          adminId: admin.id,
          amount: 1,
          note: '指标测试消课',
          createdAt: metricCreatedAt
        }
      });
    }

    it('returns daily operation metrics scoped by branch access', async () => {
      const owner = await adminToken();
      const eastManager = await adminToken('east-manager', 'manager123456');
      const member = await userToken('member-a');
      const eastBranchId = await branchIdByName('城东店');
      const westBranchId = await branchIdByName('城西店');
      await seedDailyMetricData(eastBranchId);

      const ownerMetrics = await request(app.getHttpServer())
        .get(`/admin/metrics/daily?branchId=${eastBranchId}&date=2030-02-03`)
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);

      expect(ownerMetrics.body).toMatchObject({
        date: '2030-02-03',
        branchIds: [eastBranchId],
        bookingCreatedCount: 2,
        bookingCanceledCount: 1,
        lessonDeductedCount: 1,
        fullClassCount: 1
      });

      const managerMetrics = await request(app.getHttpServer())
        .get(`/admin/metrics/daily?branchId=${eastBranchId}&date=2030-02-03`)
        .set('Authorization', `Bearer ${eastManager}`)
        .expect(200);
      expect(managerMetrics.body.bookingCreatedCount).toBe(2);
      expect(managerMetrics.body.fullClassCount).toBe(1);

      await request(app.getHttpServer())
        .get(`/admin/metrics/daily?branchId=${westBranchId}&date=2030-02-03`)
        .set('Authorization', `Bearer ${eastManager}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/admin/metrics/daily?branchId=${eastBranchId}&date=2030-02-03`)
        .set('Authorization', `Bearer ${member}`)
        .expect(403);
    });
  });

  describe('audit logs', () => {
    const futureIso = () => new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();

    async function adminToken(username = 'admin', password = 'admin123456') {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken(member: 'member-a' | 'member-b' = 'member-a') {
      const response = await request(app.getHttpServer()).post('/auth/dev-login').send({ member }).expect(201);
      return response.body.accessToken as string;
    }

    async function branchIdByName(name: string) {
      const branch = await prisma.branch.findFirstOrThrow({ where: { name }, select: { id: true } });
      return branch.id;
    }

    async function createClassWithAdmin(admin: string, branchId: string, title: string) {
      return request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title,
          coach: 'Coach Audit',
          startsAt: futureIso(),
          durationMin: 60,
          capacity: 5,
          description: '审计日志测试课程'
        })
        .expect(201);
    }

    it('records audit logs for class create, class cancel, lesson deduction, and notification retry', async () => {
      const admin = await adminToken();
      const member = await userToken();
      const eastBranchId = await branchIdByName('城东店');
      const created = await createClassWithAdmin(admin, eastBranchId, '审计日志课程');

      await request(app.getHttpServer())
        .post(`/admin/classes/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      const deductionClass = await createClassWithAdmin(admin, eastBranchId, '审计消课课程');
      const booking = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${member}`)
        .send({ classId: deductionClass.body.id, branchId: eastBranchId })
        .expect(201);
      const storedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.body.id } });

      await request(app.getHttpServer())
        .post(`/admin/bookings/${booking.body.id}/deduct`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ note: '审计消课' })
        .expect(201);

      const failedJob = await prisma.notificationJob.create({
        data: {
          gymId: created.body.gymId,
          branchId: eastBranchId,
          bookingId: booking.body.id,
          userId: storedBooking.userId,
          type: 'CLASS_REMINDER',
          scheduledAt: new Date(Date.now() - 60_000),
          status: 'FAILED',
          templateId: null
        }
      });
      await prisma.notificationLog.create({
        data: { jobId: failedJob.id, status: 'FAILED', message: '审计重试前失败' }
      });

      await request(app.getHttpServer())
        .post(`/admin/notifications/${failedJob.id}/retry`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      const logs = await request(app.getHttpServer())
        .get(`/admin/audit-logs?branchId=${eastBranchId}`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      expect(logs.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'CLASS_CREATE',
            branchId: eastBranchId,
            entityType: 'BoxingClass',
            entityId: created.body.id,
            message: expect.stringContaining('创建课程')
          }),
          expect.objectContaining({
            action: 'CLASS_CANCEL',
            entityType: 'BoxingClass',
            entityId: created.body.id,
            message: expect.stringContaining('取消课程')
          }),
          expect.objectContaining({
            action: 'LESSON_DEDUCT',
            entityType: 'Booking',
            entityId: booking.body.id,
            message: expect.stringContaining('消课')
          }),
          expect.objectContaining({
            action: 'NOTIFICATION_RETRY',
            entityType: 'NotificationJob',
            entityId: failedJob.id,
            message: expect.stringContaining('重试通知')
          })
        ])
      );
    });

    it('scopes audit log lists by admin branch access', async () => {
      const owner = await adminToken();
      const eastManager = await adminToken('east-manager', 'manager123456');
      const eastBranchId = await branchIdByName('城东店');
      const westBranchId = await branchIdByName('城西店');
      const eastClass = await createClassWithAdmin(owner, eastBranchId, '东店审计课程');
      const westClass = await createClassWithAdmin(owner, westBranchId, '西店审计课程');

      const managerLogs = await request(app.getHttpServer())
        .get('/admin/audit-logs')
        .set('Authorization', `Bearer ${eastManager}`)
        .expect(200);

      expect(managerLogs.body.some((item: { entityId: string }) => item.entityId === eastClass.body.id)).toBe(true);
      expect(managerLogs.body.some((item: { entityId: string }) => item.entityId === westClass.body.id)).toBe(false);
      expect(managerLogs.body.every((item: { branchId: string }) => item.branchId === eastBranchId)).toBe(true);

      await request(app.getHttpServer())
        .get(`/admin/audit-logs?branchId=${westBranchId}`)
        .set('Authorization', `Bearer ${eastManager}`)
        .expect(403);
    });
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StaffRole, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Boxing booking API', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  process.env.MINIAPP_APP_ID = 'test-miniapp';
  process.env.WECHAT_LOGIN_MOCK_ENABLED = 'true';
  process.env.WECHAT_AUTO_PROVISION_ENABLED = 'true';
  process.env.WECHAT_AUTO_PROVISION_LESSONS = '10';
  process.env.WECHAT_AUTO_PROVISION_BRANCH_NAME = '城东店';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    prisma = moduleRef.get(PrismaService);
    await app.init();
    await resetTestData();
  });

  afterAll(async () => {
    await app.close();
  });

  async function resetTestData() {
    const passwordHash = await bcrypt.hash('admin123456', 10);
    const managerPasswordHash = await bcrypt.hash('manager123456', 10);
    await prisma.wechatAccount.deleteMany();
    await prisma.notificationLog.deleteMany();
    await prisma.notificationJob.deleteMany();
    await prisma.lessonDeduction.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.boxingClass.deleteMany();
    await prisma.lessonBalance.deleteMany();
    await prisma.staffBranchAssignment.deleteMany();
    await prisma.memberBranch.deleteMany();
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
      update: { displayName: 'Coach Leo', role: UserRole.USER, status: 'ACTIVE' },
      create: { username: 'coach-leo', displayName: 'Coach Leo', role: UserRole.USER }
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
      await request(app.getHttpServer())
        .post('/auth/wechat-login')
        .send({ code: 'mock:openid-rejected-001' })
        .expect(403);
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

  describe('classes', () => {
    const futureIso = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    async function adminToken(username = 'admin', password = 'admin123456') {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken() {
      const response = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ member: 'member-a' })
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

      const canceled = await request(app.getHttpServer())
        .post(`/admin/classes/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);

      expect(canceled.body).toMatchObject({
        id: created.body.id,
        status: 'CANCELED'
      });
    });
  });

  describe('bookings', () => {
    const futureIso = () => new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

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

    async function createClass(capacity = 4, branchName = '城东店') {
      const admin = await adminToken();
      const branchId = await branchIdByName(branchName);
      const response = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          branchId,
          title: `预约测试 ${Date.now()} ${Math.random()}`,
          coach: 'Coach Booking',
          startsAt: futureIso(),
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

    async function createBookedClass(member: 'member-a' | 'member-b' = 'member-a') {
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
        .send({ classId: boxingClass.body.id, branchId })
        .expect(201);

      return { bookingId: booking.body.id, classId: boxingClass.body.id };
    }

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
});

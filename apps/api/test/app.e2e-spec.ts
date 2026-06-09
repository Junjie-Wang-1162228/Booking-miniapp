import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Boxing booking API', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    await prisma.notificationLog.deleteMany();
    await prisma.notificationJob.deleteMany();
    await prisma.lessonDeduction.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.boxingClass.deleteMany();

    const admin = await prisma.user.upsert({
      where: { username: 'admin' },
      update: { displayName: '馆长', role: UserRole.ADMIN, passwordHash, status: 'ACTIVE' },
      create: { username: 'admin', displayName: '馆长', role: UserRole.ADMIN, passwordHash }
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

    await prisma.lessonBalance.upsert({
      where: { userId: memberA.id },
      update: { remaining: 10 },
      create: { userId: memberA.id, remaining: 10 }
    });
    await prisma.lessonBalance.upsert({
      where: { userId: memberB.id },
      update: { remaining: 6 },
      create: { userId: memberB.id, remaining: 6 }
    });

    const now = new Date();
    await prisma.boxingClass.createMany({
      data: [
        {
          title: '基础拳击燃脂',
          coach: 'Coach Leo',
          startsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          durationMin: 60,
          capacity: 8,
          description: '适合新手和恢复训练，重点练习步伐、直拳和基础组合。'
        },
        {
          title: '进阶组合拳',
          coach: 'Coach Mina',
          startsAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
          durationMin: 75,
          capacity: 6,
          description: '强化组合拳、闪躲和节奏控制，适合有基础的会员。'
        },
        {
          title: '周末实战体能',
          coach: 'Coach Han',
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
  });

  describe('classes', () => {
    const futureIso = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    async function adminToken() {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username: 'admin', password: 'admin123456' })
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

    it('lets a member list available future scheduled classes', async () => {
      const token = await userToken();

      const response = await request(app.getHttpServer())
        .get('/classes')
        .set('Authorization', `Bearer ${token}`)
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
        .get('/classes')
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

    async function adminToken() {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username: 'admin', password: 'admin123456' })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken(member: 'member-a' | 'member-b' = 'member-a') {
      const response = await request(app.getHttpServer()).post('/auth/dev-login').send({ member }).expect(201);
      return response.body.accessToken as string;
    }

    async function createClass(capacity = 4) {
      const admin = await adminToken();
      const response = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
          title: `预约测试 ${Date.now()} ${Math.random()}`,
          coach: 'Coach Booking',
          startsAt: futureIso(),
          durationMin: 60,
          capacity,
          description: '预约测试课程'
        })
        .expect(201);
      return response.body as { id: string };
    }

    it('lets a member book a class and see only their own booking', async () => {
      const boxingClass = await createClass();
      const memberA = await userToken('member-a');
      const memberB = await userToken('member-b');

      const created = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id })
        .expect(201);

      expect(created.body).toMatchObject({
        id: expect.any(String),
        status: 'BOOKED',
        attendanceStatus: 'PENDING',
        boxingClass: { id: boxingClass.id }
      });

      const memberABookings = await request(app.getHttpServer())
        .get('/bookings/me')
        .set('Authorization', `Bearer ${memberA}`)
        .expect(200);
      expect(memberABookings.body.some((item: { id: string }) => item.id === created.body.id)).toBe(true);

      const memberBBookings = await request(app.getHttpServer())
        .get('/bookings/me')
        .set('Authorization', `Bearer ${memberB}`)
        .expect(200);
      expect(memberBBookings.body.some((item: { id: string }) => item.id === created.body.id)).toBe(false);
    });

    it('rejects duplicate active booking for the same class', async () => {
      const boxingClass = await createClass();
      const memberA = await userToken('member-a');

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id })
        .expect(409);
    });

    it('enforces class capacity', async () => {
      const boxingClass = await createClass(1);
      const memberA = await userToken('member-a');
      const memberB = await userToken('member-b');

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberB}`)
        .send({ classId: boxingClass.id })
        .expect(409);
    });

    it('lets a member cancel only their own booking before class start', async () => {
      const boxingClass = await createClass();
      const memberA = await userToken('member-a');
      const memberB = await userToken('member-b');

      const created = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${memberA}`)
        .send({ classId: boxingClass.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/bookings/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${memberB}`)
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
        .send({ classId: boxingClass.id, remindBeforeMinutes: 120 })
        .expect(201);

      const jobs = await prisma.notificationJob.findMany({
        where: { bookingId: created.body.id }
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        bookingId: created.body.id,
        type: 'CLASS_REMINDER',
        status: 'PENDING'
      });
    });
  });

  describe('admin bookings and lesson deductions', () => {
    const futureIso = () => new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();

    async function adminToken() {
      const response = await request(app.getHttpServer())
        .post('/auth/admin-login')
        .send({ username: 'admin', password: 'admin123456' })
        .expect(201);
      return response.body.accessToken as string;
    }

    async function userToken(member: 'member-a' | 'member-b' = 'member-a') {
      const response = await request(app.getHttpServer()).post('/auth/dev-login').send({ member }).expect(201);
      return response.body.accessToken as string;
    }

    async function createBookedClass(member: 'member-a' | 'member-b' = 'member-a') {
      const admin = await adminToken();
      const user = await userToken(member);
      const boxingClass = await request(app.getHttpServer())
        .post('/admin/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({
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
        .send({ classId: boxingClass.body.id })
        .expect(201);

      return { bookingId: booking.body.id, classId: boxingClass.body.id };
    }

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
        .get('/deductions/me')
        .set('Authorization', `Bearer ${memberA}`)
        .expect(200);
      expect(mine.body.some((item: { id: string }) => item.id === deducted.body.id)).toBe(true);

      const otherMember = await request(app.getHttpServer())
        .get('/deductions/me')
        .set('Authorization', `Bearer ${memberB}`)
        .expect(200);
      expect(otherMember.body.some((item: { id: string }) => item.id === deducted.body.id)).toBe(false);

      const all = await request(app.getHttpServer())
        .get('/admin/deductions')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(all.body.some((item: { id: string }) => item.id === deducted.body.id)).toBe(true);
    });
  });
});

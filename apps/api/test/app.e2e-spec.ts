import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Boxing booking API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

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

  it.skip('enabled after admin bookings route exists: rejects user JWT from admin bookings', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/dev-login')
      .send({ member: 'member-a' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/admin/bookings')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
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
});

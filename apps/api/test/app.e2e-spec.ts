import { INestApplication } from '@nestjs/common';
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
});

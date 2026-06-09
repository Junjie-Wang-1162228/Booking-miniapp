# Boxing Booking MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working MVP for a boxing gym class booking mini program with a web admin dashboard, account isolation, lesson deduction, and notification job creation.

**Architecture:** Use a pnpm monorepo with one NestJS API as the source of truth, MySQL managed through Prisma, a Taro + React mini program for members, and a React web dashboard for admins. The API enforces JWT authentication and RBAC so user data isolation is owned by the backend, not the UI.

**Tech Stack:** pnpm workspaces, TypeScript, NestJS, Prisma, MySQL, Jest/Supertest, React, Vite, Taro, NutUI Taro, CSS modules/global CSS.

---

## Scope Check

This is one integrated MVP because the mini program and admin dashboard cannot be verified without the same backend rules. Implement backend behavior first, then admin web, then mini program, then end-to-end verification.

## File Structure

Create this structure:

```text
.
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── apps
│   ├── api
│   │   ├── package.json
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/seed.ts
│   │   ├── src/main.ts
│   │   ├── src/app.module.ts
│   │   ├── src/prisma/prisma.module.ts
│   │   ├── src/prisma/prisma.service.ts
│   │   ├── src/auth/*
│   │   ├── src/classes/*
│   │   ├── src/bookings/*
│   │   ├── src/lesson-deductions/*
│   │   ├── src/notifications/*
│   │   └── test/app.e2e-spec.ts
│   ├── admin
│   │   ├── package.json
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── src/*
│   └── miniapp
│       ├── package.json
│       ├── project.config.json
│       ├── tsconfig.json
│       ├── config/index.ts
│       └── src/*
```

## Shared Domain Decisions

- `user` and `admin` are the only roles.
- Development mini program login uses a simple `POST /auth/dev-login` endpoint with `member-a` or `member-b`; production WeChat login can replace this without changing booking APIs.
- Admin login uses `POST /auth/admin-login` with seeded credentials.
- Class statuses: `SCHEDULED`, `CANCELED`.
- Booking statuses: `BOOKED`, `CANCELED`.
- Attendance statuses: `PENDING`, `ATTENDED`.
- Lesson deduction is immutable and has a unique `bookingId`.
- A user cannot book a canceled class, a full class, the same class twice, or a class that has already started.
- A user can cancel only their own booked class before class start.
- An admin can deduct only a non-canceled booking once, and the user must have at least one lesson remaining.

## Task 1: Workspace, Tooling, And Database Shell

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create root workspace files**

`package.json`:

```json
{
  "name": "boxing-booking-miniapp",
  "private": true,
  "packageManager": "pnpm@9.15.9",
  "scripts": {
    "dev:db": "docker compose up -d mysql",
    "stop:db": "docker compose down",
    "db:logs": "docker compose logs -f mysql",
    "api:dev": "pnpm --filter @booking/api start:dev",
    "admin:dev": "pnpm --filter @booking/admin dev",
    "miniapp:dev": "pnpm --filter @booking/miniapp dev:weapp",
    "test": "pnpm --filter @booking/api test:e2e",
    "build": "pnpm --filter @booking/api build && pnpm --filter @booking/admin build && pnpm --filter @booking/miniapp build:weapp",
    "lint": "pnpm --filter @booking/api lint && pnpm --filter @booking/admin lint"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

`docker-compose.yml`:

```yaml
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: booking_root
      MYSQL_DATABASE: boxing_booking
      MYSQL_USER: booking_user
      MYSQL_PASSWORD: booking_pass
    ports:
      - "3307:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 20

volumes:
  mysql-data:
```

`.env.example`:

```bash
DATABASE_URL="mysql://booking_user:booking_pass@localhost:3307/boxing_booking"
JWT_SECRET="dev-secret-change-before-production"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123456"
MINIAPP_APP_ID="personal-mvp-appid"
WECHAT_SUBSCRIBE_TEMPLATE_ID=""
API_PORT="4000"
VITE_API_BASE_URL="http://localhost:4000"
TARO_APP_API_BASE_URL="http://localhost:4000"
```

`.gitignore`:

```gitignore
node_modules
dist
.env
.DS_Store
coverage
apps/api/generated
apps/miniapp/dist
apps/admin/dist
```

`README.md`:

```markdown
# Boxing Booking Miniapp

MVP for a boxing gym booking mini program and admin dashboard.

## Local Development

1. Copy `.env.example` to `.env` in the root and in `apps/api/.env` when the API task is implemented.
2. Start MySQL with `pnpm dev:db`.
3. Run API migrations and seed data with `pnpm --filter @booking/api prisma:migrate` and `pnpm --filter @booking/api prisma:seed`.
4. Start the API with `pnpm api:dev`.
5. Start admin with `pnpm admin:dev`.
6. Start mini program build with `pnpm miniapp:dev`.
```

- [ ] **Step 2: Verify database container starts**

Run:

```bash
pnpm dev:db
docker compose ps mysql
```

Expected: `mysql` is `running` or `healthy`.

- [ ] **Step 3: Commit workspace shell**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json docker-compose.yml .env.example .gitignore README.md
git commit -m "chore: set up workspace shell"
```

## Task 2: API Project, Prisma Schema, And Seed Data

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`

- [ ] **Step 1: Create API package configuration**

`apps/api/package.json`:

```json
{
  "name": "@booking/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start:dev": "nest start --watch",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\"",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev --name init",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/passport": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/schedule": "^6.0.0",
    "@prisma/client": "^6.0.0",
    "bcryptjs": "^2.4.3",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/express": "^5.0.0",
    "@types/jest": "^30.0.0",
    "@types/node": "^24.0.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.0.0",
    "jest": "^30.0.0",
    "prisma": "^6.0.0",
    "source-map-support": "^0.5.21",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.0",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 2: Add Nest TypeScript config**

`apps/api/nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "types": ["node", "jest"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "prisma/**/*.ts"]
}
```

`apps/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"]
}
```

- [ ] **Step 3: Create Prisma schema**

`apps/api/prisma/schema.prisma` must define these models and constraints:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  USER
  ADMIN
}

enum UserStatus {
  ACTIVE
  DISABLED
}

enum ClassStatus {
  SCHEDULED
  CANCELED
}

enum BookingStatus {
  BOOKED
  CANCELED
}

enum AttendanceStatus {
  PENDING
  ATTENDED
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
  SKIPPED
}

model User {
  id               String            @id @default(cuid())
  role             UserRole
  status           UserStatus        @default(ACTIVE)
  displayName      String
  phone            String?           @unique
  username         String?           @unique
  passwordHash     String?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  wechatAccounts   WechatAccount[]
  bookings         Booking[]
  lessonBalance    LessonBalance?
  lessonDeductions LessonDeduction[] @relation("MemberDeductions")
  adminDeductions  LessonDeduction[] @relation("AdminDeductions")
}

model WechatAccount {
  id        String   @id @default(cuid())
  userId    String
  appId     String
  openid    String
  unionid   String?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])

  @@unique([appId, openid])
  @@index([userId])
}

model BoxingClass {
  id          String      @id @default(cuid())
  title       String
  coach       String
  startsAt    DateTime
  durationMin Int
  capacity    Int
  status      ClassStatus @default(SCHEDULED)
  description String      @db.VarChar(500)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  bookings    Booking[]

  @@index([startsAt])
  @@index([status])
}

model Booking {
  id               String             @id @default(cuid())
  userId           String
  classId          String
  status           BookingStatus      @default(BOOKED)
  attendanceStatus AttendanceStatus   @default(PENDING)
  canceledAt       DateTime?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  user             User               @relation(fields: [userId], references: [id])
  boxingClass      BoxingClass        @relation(fields: [classId], references: [id])
  lessonDeduction  LessonDeduction?
  notificationJobs NotificationJob[]

  @@unique([userId, classId, status])
  @@index([classId])
  @@index([userId])
}

model LessonBalance {
  id        String   @id @default(cuid())
  userId    String   @unique
  remaining Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
}

model LessonDeduction {
  id        String   @id @default(cuid())
  bookingId String   @unique
  userId    String
  adminId   String
  amount    Int      @default(1)
  note      String?  @db.VarChar(300)
  createdAt DateTime @default(now())
  booking   Booking  @relation(fields: [bookingId], references: [id])
  user      User     @relation("MemberDeductions", fields: [userId], references: [id])
  admin     User     @relation("AdminDeductions", fields: [adminId], references: [id])

  @@index([userId])
  @@index([adminId])
}

model NotificationJob {
  id          String             @id @default(cuid())
  bookingId   String
  userId      String
  type        String
  scheduledAt DateTime
  status      NotificationStatus @default(PENDING)
  templateId  String?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  booking     Booking            @relation(fields: [bookingId], references: [id])
  logs        NotificationLog[]

  @@index([scheduledAt, status])
  @@index([userId])
}

model NotificationLog {
  id        String             @id @default(cuid())
  jobId     String
  status    NotificationStatus
  message   String             @db.VarChar(500)
  createdAt DateTime           @default(now())
  job       NotificationJob     @relation(fields: [jobId], references: [id])

  @@index([jobId])
}
```

- [ ] **Step 4: Create seed data**

`apps/api/prisma/seed.ts` seeds:

- Admin: username `admin`, password `admin123456`, role `ADMIN`.
- Member A: display name `阿杰`, phone `18800000001`, 10 lessons.
- Member B: display name `小林`, phone `18800000002`, 6 lessons.
- Three future scheduled classes with different coaches and capacities.

Use `bcryptjs.hash("admin123456", 10)` for the admin password.

- [ ] **Step 5: Add Prisma service**

`apps/api/src/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
```

- [ ] **Step 6: Install dependencies and verify schema**

Run:

```bash
pnpm install
cp .env.example apps/api/.env
pnpm dev:db
pnpm --filter @booking/api prisma:generate
pnpm --filter @booking/api prisma:migrate
pnpm --filter @booking/api prisma:seed
```

Expected: Prisma generates a client, creates MySQL tables, and seed exits with code 0.

- [ ] **Step 7: Commit API schema**

```bash
git add apps/api package.json pnpm-lock.yaml
git commit -m "feat(api): add prisma schema and seed data"
```

## Task 3: API Auth, RBAC, And Health

**Files:**
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/jwt.strategy.ts`
- Create: `apps/api/src/auth/current-user.decorator.ts`
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/roles.decorator.ts`
- Create: `apps/api/src/auth/roles.guard.ts`
- Create: `apps/api/src/auth/dto.ts`
- Create: `apps/api/test/jest-e2e.json`
- Create: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Write failing auth e2e tests**

Add tests that verify:

- `GET /health` returns `{ "ok": true }`.
- `POST /auth/admin-login` returns an admin JWT.
- `POST /auth/dev-login` for `member-a` returns a user JWT.
- `GET /auth/me` returns the current user when a JWT is sent.
- `GET /auth/me` for a member includes `lessonBalance.remaining`.
- `GET /admin/bookings` rejects a user JWT with 403 once admin routes exist.

- [ ] **Step 2: Run auth tests and confirm failure**

Run:

```bash
pnpm --filter @booking/api test:e2e
```

Expected before implementation: FAIL because `AppModule` and auth routes are missing.

- [ ] **Step 3: Implement Nest bootstrap and app module**

`main.ts` must enable validation pipe and CORS for local admin and mini program development:

```ts
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const config = app.get(ConfigService);
  await app.listen(Number(config.get('API_PORT') ?? 4000));
}

bootstrap();
```

- [ ] **Step 4: Implement JWT payload and guards**

JWT payload shape:

```ts
export type JwtUser = {
  sub: string;
  role: 'USER' | 'ADMIN';
  displayName: string;
};
```

`@CurrentUser()` returns `JwtUser`. `@Roles('ADMIN')` protects admin controllers. `JwtAuthGuard` rejects missing or invalid tokens.

- [ ] **Step 5: Implement auth service and controller**

Routes:

```text
GET  /health
POST /auth/admin-login
POST /auth/dev-login
GET  /auth/me
```

`POST /auth/dev-login` accepts `{ "member": "member-a" }` or `{ "member": "member-b" }` and maps to seeded phones `18800000001` and `18800000002`.

`GET /auth/me` returns:

```ts
{
  id: string;
  role: 'USER' | 'ADMIN';
  displayName: string;
  phone: string | null;
  lessonBalance: { remaining: number } | null;
}
```

- [ ] **Step 6: Run auth tests**

Run:

```bash
pnpm --filter @booking/api test:e2e
```

Expected: auth and health tests pass. Admin route authorization test can pass after Task 6 creates `/admin/bookings`; keep it skipped until then using `it.skip` with the exact text `enabled after admin bookings route exists`.

- [ ] **Step 7: Commit auth**

```bash
git add apps/api/src apps/api/test
git commit -m "feat(api): add jwt auth and rbac guards"
```

## Task 4: API Class Management

**Files:**
- Create: `apps/api/src/classes/classes.module.ts`
- Create: `apps/api/src/classes/classes.controller.ts`
- Create: `apps/api/src/classes/classes.service.ts`
- Create: `apps/api/src/classes/dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Add failing e2e tests for classes**

Test these behaviors:

- User JWT can `GET /classes` and receives only future `SCHEDULED` classes.
- Admin JWT can `POST /admin/classes` with title, coach, startsAt, durationMin, capacity, description.
- A class created by admin appears in `GET /classes`.
- User JWT cannot `POST /admin/classes`.
- Admin can `PATCH /admin/classes/:id`.
- Admin can `POST /admin/classes/:id/cancel`.

- [ ] **Step 2: Run tests and confirm class failures**

Run:

```bash
pnpm --filter @booking/api test:e2e
```

Expected: class tests fail with 404.

- [ ] **Step 3: Implement class DTO validation**

`CreateClassDto` fields:

```ts
title: string;
coach: string;
startsAt: string;
durationMin: number;
capacity: number;
description: string;
```

Validation rules:

- `title`, `coach`, and `description` are non-empty strings.
- `startsAt` is an ISO date string.
- `durationMin` is an integer from 30 to 240.
- `capacity` is an integer from 1 to 100.

- [ ] **Step 4: Implement class service**

Service methods:

```ts
listAvailable(now = new Date())
listAdmin()
create(dto)
update(id, dto)
cancel(id)
```

`listAvailable` returns classes where `status = SCHEDULED` and `startsAt > now`, ordered by `startsAt asc`, and includes remaining spots by subtracting active booked count from capacity.

- [ ] **Step 5: Implement controllers**

Routes:

```text
GET   /classes
GET   /admin/classes
POST  /admin/classes
PATCH /admin/classes/:id
POST  /admin/classes/:id/cancel
```

All `/admin/*` class routes require `ADMIN`.

- [ ] **Step 6: Run class tests**

Run:

```bash
pnpm --filter @booking/api test:e2e
```

Expected: class tests pass.

- [ ] **Step 7: Commit class management**

```bash
git add apps/api/src/classes apps/api/src/app.module.ts apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): add class management"
```

## Task 5: API User Bookings And Notification Jobs

**Files:**
- Create: `apps/api/src/bookings/bookings.module.ts`
- Create: `apps/api/src/bookings/bookings.controller.ts`
- Create: `apps/api/src/bookings/bookings.service.ts`
- Create: `apps/api/src/bookings/dto.ts`
- Create: `apps/api/src/notifications/notifications.module.ts`
- Create: `apps/api/src/notifications/notifications.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Add failing e2e tests for bookings**

Test these behaviors:

- Member A can book a scheduled class.
- Member A sees that booking from `GET /bookings/me`.
- Member B does not see Member A's booking from `GET /bookings/me`.
- Member A cannot book the same class twice.
- Capacity is enforced when the class is full.
- Member A can cancel only their own booking before class start.
- Member B cannot cancel Member A's booking.
- Booking with `{ "remindBeforeMinutes": 120 }` creates one notification job.

- [ ] **Step 2: Run tests and confirm booking failures**

Run:

```bash
pnpm --filter @booking/api test:e2e
```

Expected: booking tests fail with 404.

- [ ] **Step 3: Implement booking DTOs**

`CreateBookingDto`:

```ts
classId: string;
remindBeforeMinutes?: number;
```

Validation:

- `classId` is non-empty.
- `remindBeforeMinutes` is optional and must be one of `60`, `120`, `180`, `1440`.

- [ ] **Step 4: Implement booking service transaction**

`createBooking(userId, dto)` must:

1. Load the class.
2. Reject missing, canceled, or already-started classes with 400.
3. Count active bookings.
4. Reject full classes with 409.
5. Reject duplicate active booking with 409.
6. Create booking.
7. If `remindBeforeMinutes` exists, create `NotificationJob` scheduled at `class.startsAt - remindBeforeMinutes`.

- [ ] **Step 5: Implement booking routes**

Routes:

```text
GET  /bookings/me
POST /bookings
POST /bookings/:id/cancel
```

Every route derives the user id from JWT and never accepts `userId` from the request body.

- [ ] **Step 6: Implement notification service**

Methods:

```ts
createClassReminder(bookingId: string, userId: string, classStartsAt: Date, remindBeforeMinutes: number): Promise<void>
listJobsForBooking(bookingId: string): Promise<NotificationJob[]>
```

No WeChat API call is needed in this task. The MVP must persist jobs so sending can be added safely.

- [ ] **Step 7: Run booking tests**

Run:

```bash
pnpm --filter @booking/api test:e2e
```

Expected: booking and notification job tests pass.

- [ ] **Step 8: Commit booking flow**

```bash
git add apps/api/src/bookings apps/api/src/notifications apps/api/src/app.module.ts apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): add user booking flow"
```

## Task 6: API Admin Bookings And Lesson Deduction

**Files:**
- Create: `apps/api/src/lesson-deductions/lesson-deductions.module.ts`
- Create: `apps/api/src/lesson-deductions/lesson-deductions.controller.ts`
- Create: `apps/api/src/lesson-deductions/lesson-deductions.service.ts`
- Create: `apps/api/src/lesson-deductions/dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Add failing e2e tests for admin booking operations**

Test these behaviors:

- Admin can `GET /admin/bookings`.
- User JWT gets 403 from `GET /admin/bookings`.
- Admin can `POST /admin/bookings/:id/deduct`.
- Deduction sets booking `attendanceStatus` to `ATTENDED`.
- Deduction decrements the member lesson balance by 1.
- Duplicate deduction for the same booking returns 409.
- User JWT gets 403 from deduction route.
- Member can `GET /deductions/me` and sees only their own deduction.
- Admin can `GET /admin/deductions`.

- [ ] **Step 2: Run tests and confirm admin failures**

Run:

```bash
pnpm --filter @booking/api test:e2e
```

Expected: admin booking and deduction tests fail with 404.

- [ ] **Step 3: Implement deduction DTO**

`DeductLessonDto`:

```ts
note?: string;
```

Validation:

- `note` is optional.
- When present, `note` has max length 300.

- [ ] **Step 4: Implement admin booking list**

`GET /admin/bookings` supports query parameters:

```text
date=YYYY-MM-DD
status=BOOKED|CANCELED
q=member name or phone
```

Return booking id, member name, phone, class title, coach, startsAt, booking status, attendance status, and deduction id when present.

- [ ] **Step 5: Implement transactional deduction**

In one Prisma transaction:

1. Load booking with class and user balance.
2. Reject missing booking with 404.
3. Reject canceled booking with 400.
4. Reject duplicate deduction with 409.
5. Reject missing balance or `remaining <= 0` with 409.
6. Create `LessonDeduction`.
7. Decrement `LessonBalance.remaining`.
8. Set `Booking.attendanceStatus = ATTENDED`.

- [ ] **Step 6: Implement deduction routes**

Routes:

```text
GET  /admin/bookings
POST /admin/bookings/:id/deduct
GET  /admin/deductions
GET  /deductions/me
```

Admin routes require `ADMIN`; `/deductions/me` derives member id from JWT.

- [ ] **Step 7: Run API tests**

Run:

```bash
pnpm --filter @booking/api test:e2e
```

Expected: all API e2e tests pass.

- [ ] **Step 8: Commit admin booking operations**

```bash
git add apps/api/src/lesson-deductions apps/api/src/app.module.ts apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): add admin lesson deduction"
```

## Task 7: Admin Web Dashboard

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/index.html`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/src/main.tsx`
- Create: `apps/admin/src/App.tsx`
- Create: `apps/admin/src/api.ts`
- Create: `apps/admin/src/styles.css`
- Create: `apps/admin/src/types.ts`

- [ ] **Step 1: Create admin package**

Use Vite React with dependencies:

```json
{
  "name": "@booking/admin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "tsc -b && vite build",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "antd": "^5.0.0",
    "dayjs": "^1.11.0",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.8.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Implement API client**

`api.ts` exports:

```ts
loginAdmin(username: string, password: string)
getAdminBookings(token: string, filters: { date?: string; q?: string; status?: string })
getAdminDeductions(token: string)
getAdminClasses(token: string)
createClass(token: string, input: CreateClassInput)
updateClass(token: string, id: string, input: Partial<CreateClassInput>)
cancelClass(token: string, id: string)
deductBooking(token: string, bookingId: string, note?: string)
```

Every function calls `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'}` and throws an `Error` with the server message when the response is not ok.

- [ ] **Step 3: Implement admin UI**

`App.tsx` states:

- Logged out login form.
- Logged in shell with three tabs: bookings, classes, deductions.
- Bookings table with date filter, search input, status select, and deduct button.
- Class management form for create/edit/cancel.
- Deductions table.

The deduct button opens a confirm dialog and then calls `deductBooking`.

- [ ] **Step 4: Apply admin visual style**

`styles.css` uses:

- Dark charcoal page background.
- White content surface.
- Red primary buttons.
- Status badges.
- Dense table spacing.
- Responsive single-column layout under 768px.

- [ ] **Step 5: Build admin**

Run:

```bash
pnpm --filter @booking/admin build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 6: Commit admin dashboard**

```bash
git add apps/admin package.json pnpm-lock.yaml
git commit -m "feat(admin): add booking operations dashboard"
```

## Task 8: Taro Mini Program User App

**Files:**
- Create: `apps/miniapp/package.json`
- Create: `apps/miniapp/project.config.json`
- Create: `apps/miniapp/tsconfig.json`
- Create: `apps/miniapp/config/index.ts`
- Create: `apps/miniapp/src/app.tsx`
- Create: `apps/miniapp/src/app.config.ts`
- Create: `apps/miniapp/src/app.scss`
- Create: `apps/miniapp/src/api.ts`
- Create: `apps/miniapp/src/types.ts`
- Create: `apps/miniapp/src/pages/classes/index.tsx`
- Create: `apps/miniapp/src/pages/classes/index.scss`
- Create: `apps/miniapp/src/pages/bookings/index.tsx`
- Create: `apps/miniapp/src/pages/bookings/index.scss`
- Create: `apps/miniapp/src/pages/profile/index.tsx`
- Create: `apps/miniapp/src/pages/profile/index.scss`

- [ ] **Step 1: Create miniapp package**

Use Taro React package scripts:

```json
{
  "name": "@booking/miniapp",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev:weapp": "taro build --type weapp --watch",
    "build:weapp": "taro build --type weapp"
  },
  "dependencies": {
    "@nutui/nutui-react-taro": "^3.0.0",
    "@tarojs/components": "^4.0.0",
    "@tarojs/helper": "^4.0.0",
    "@tarojs/plugin-framework-react": "^4.0.0",
    "@tarojs/plugin-platform-weapp": "^4.0.0",
    "@tarojs/react": "^4.0.0",
    "@tarojs/runtime": "^4.0.0",
    "@tarojs/taro": "^4.0.0",
    "@tarojs/webpack5-runner": "^4.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tarojs/cli": "^4.0.0",
    "@types/react": "^18.3.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Configure pages and tab bar**

`app.config.ts` pages:

```ts
pages: [
  'pages/classes/index',
  'pages/bookings/index',
  'pages/profile/index'
]
```

Tab bar:

```text
约课
我的
账户
```

Use a black tab bar with red selected color.

- [ ] **Step 3: Implement miniapp API client**

`api.ts` exports:

```ts
devLogin(member: 'member-a' | 'member-b')
getClasses(token: string)
createBooking(token: string, classId: string, remindBeforeMinutes?: number)
getMyBookings(token: string)
cancelBooking(token: string, bookingId: string)
getMyDeductions(token: string)
getMe(token: string)
```

Use `Taro.request` and store JWT in `Taro.setStorageSync('token', token)`.

- [ ] **Step 4: Implement class booking page**

The first screen shows:

- Header with gym name and remaining lesson count if available from `/auth/me`.
- Segmented member switch for MVP: `阿杰` and `小林`, calling `devLogin`.
- Class cards with time, title, coach, capacity, remaining spots, status.
- Primary red booking button.
- Reminder switch that sends `remindBeforeMinutes: 120` when enabled.

- [ ] **Step 5: Implement my bookings page**

Show:

- Upcoming bookings.
- Status badge.
- Cancel button only for active bookings.
- Empty state when no bookings exist.

- [ ] **Step 6: Implement profile page**

Show:

- Current member.
- Lesson balance.
- Deduction history.
- Development account switch.
- Note that formal launch should use the gym-owned mini program subject.

- [ ] **Step 7: Apply miniapp visual style**

Use:

- Dark background.
- Red action buttons.
- High-contrast white cards.
- Boxing-style labels such as `今日训练`, `剩余名额`, `拳课余额`.
- Minimum 44px tap targets.

- [ ] **Step 8: Build mini program**

Run:

```bash
pnpm --filter @booking/miniapp build:weapp
```

Expected: Taro creates `apps/miniapp/dist` without TypeScript errors.

- [ ] **Step 9: Commit mini program**

```bash
git add apps/miniapp package.json pnpm-lock.yaml
git commit -m "feat(miniapp): add member booking experience"
```

## Task 9: Integration Verification And Runtime Notes

**Files:**
- Modify: `README.md`
- Create: `docs/manual-test-checklist.md`

- [ ] **Step 1: Add manual checklist**

`docs/manual-test-checklist.md` must include:

```markdown
# Manual Test Checklist

- [ ] Start MySQL with `pnpm dev:db`.
- [ ] Run migrations and seed with `pnpm --filter @booking/api prisma:migrate && pnpm --filter @booking/api prisma:seed`.
- [ ] Start API with `pnpm api:dev`.
- [ ] Start admin with `pnpm admin:dev`.
- [ ] Log in admin with `admin` / `admin123456`.
- [ ] Create a future class.
- [ ] Open miniapp build in WeChat DevTools from `apps/miniapp`.
- [ ] Log in as 阿杰.
- [ ] Book the created class with reminder enabled.
- [ ] Switch to 小林 and verify 阿杰's booking is not visible.
- [ ] Use admin dashboard to deduct 阿杰's booking.
- [ ] Verify duplicate deduction is rejected.
- [ ] Verify 阿杰's lesson balance decreases by 1.
- [ ] Verify a notification job exists in the database for the reminder booking.
```

- [ ] **Step 2: Run automated verification**

Run:

```bash
pnpm test
pnpm build
```

Expected: API e2e tests pass and all apps build.

- [ ] **Step 3: Run UI smoke test**

Run in separate terminals:

```bash
pnpm api:dev
pnpm admin:dev
```

Open `http://localhost:5173`, log in, create a class, and deduct a seeded booking.

- [ ] **Step 4: Commit verification docs**

```bash
git add README.md docs/manual-test-checklist.md
git commit -m "docs: add mvp verification checklist"
```

## Completion Criteria

The MVP is complete only when:

- API e2e tests pass.
- Admin build passes.
- Miniapp WeChat build passes.
- Manual checklist has been executed or every unexecuted item is clearly reported.
- User A and User B data isolation is verified.
- Admin deduction and duplicate prevention are verified.
- Notification job creation is verified.
- The README explains personal MVP account versus gym-owned production release.

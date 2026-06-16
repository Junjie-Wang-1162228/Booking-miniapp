# Multi-Branch Booking Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the boxing booking MVP from a single-branch app into a branch-isolated system where one gym owner can manage multiple branches, members book within their assigned branches, staff permissions are branch-scoped, and coach transfers preserve history.

**Architecture:** Keep the existing pnpm monorepo, NestJS API, Prisma/MySQL database, React admin web, and Taro mini program. Add explicit `gymId` and `branchId` to branch-scoped records, add focused branch access services in the API, and keep frontend branch selection as UI state backed by server-side authorization checks.

**Tech Stack:** TypeScript, NestJS, Prisma, MySQL, Jest/Supertest, React, Vite, Ant Design, Taro, NutUI Taro.

---

## File Structure

Create these API domain files:

- `apps/api/src/branches/branches.module.ts`: wires branch services and controllers.
- `apps/api/src/branches/branches.controller.ts`: exposes member and admin branch list endpoints.
- `apps/api/src/branches/branch-access.service.ts`: centralizes branch authorization and staff scope checks.
- `apps/api/src/branches/branch-scope.types.ts`: shared branch scope and staff role types.
- `apps/api/src/branches/branch-view.mapper.ts`: maps branch records to API response shapes.

Modify these API files:

- `apps/api/prisma/schema.prisma`: add gym, branch, member branch, staff assignment, branch IDs, coach IDs, and branch-scoped balance uniqueness.
- `apps/api/prisma/seed.ts`: seed one gym, two branches, staff assignments, coach transfer data, member branches, branch balances, and branch classes.
- `apps/api/src/app.module.ts`: import `BranchesModule`.
- `apps/api/src/auth/auth.service.ts`: return accessible branches and branch-scoped balance data.
- `apps/api/src/auth/auth.types.ts`: keep JWT lean but ensure user identity is enough for branch access lookup.
- `apps/api/src/classes/dto.ts`: add `branchId` and optional `coachId`.
- `apps/api/src/classes/classes.controller.ts`: read branch query context and pass current user for admin checks.
- `apps/api/src/classes/classes.service.ts`: enforce branch access, coach assignment, and branch-scoped class listing.
- `apps/api/src/bookings/dto.ts`: require `branchId` for booking creation.
- `apps/api/src/bookings/bookings.controller.ts`: require `branchId` query for member lists and cancellation context.
- `apps/api/src/bookings/bookings.service.ts`: enforce member branch access, class branch matching, capacity, balance, duplicate booking, and cancellation ownership.
- `apps/api/src/lesson-deductions/dto.ts`: add optional `branchId` filters to admin queries and require `branchId` for member deduction listing.
- `apps/api/src/lesson-deductions/lesson-deductions.controller.ts`: pass current user and branch query context.
- `apps/api/src/lesson-deductions/lesson-deductions.service.ts`: enforce branch-scoped admin access and branch balance deduction.
- `apps/api/src/notifications/notifications.service.ts`: persist `gymId` and `branchId` on notification jobs.
- `apps/api/test/app.e2e-spec.ts`: reset and test multi-branch behavior.

Modify admin web files:

- `apps/admin/src/types.ts`: add branch, staff-aware auth, class branch, booking branch, and deduction branch response types.
- `apps/admin/src/api.ts`: add branch API calls and branch query parameters.
- `apps/admin/src/App.tsx`: add branch selector, branch-aware class creation, and branch-filtered tables.
- `apps/admin/src/styles.css`: style branch controls and branch badges.

Modify mini program files:

- `apps/miniapp/src/types.ts`: add branch and branch-aware response types.
- `apps/miniapp/src/api.ts`: add branch endpoints and branch query parameters.
- `apps/miniapp/src/pages/classes/index.tsx`: add selected branch state and branch-scoped class listing/booking.
- `apps/miniapp/src/pages/bookings/index.tsx`: use selected branch for booking list and cancellation refresh.
- `apps/miniapp/src/pages/profile/index.tsx`: show branch-scoped balance and deduction records.
- `apps/miniapp/src/app.scss` and page SCSS files: add compact branch selector styling.

Quality constraints:

- Keep branch authorization inside `BranchAccessService`; controllers must not inline branch permission logic.
- Use descriptive names such as `selectedBranchId`, `accessibleBranches`, `branchScopedBookings`, `ensureMemberBranchAccess`, and `resolveAdminBranchScope`.
- Do not add empty service methods, unused code paths, or temporary branch access bypasses.
- Preserve transaction boundaries for booking and lesson deduction.
- Add or update e2e tests in the same task as each backend behavior change.

## Task 1: Add Multi-Branch Prisma Schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Test: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Write failing schema-aware test expectations**

In `apps/api/test/app.e2e-spec.ts`, extend the reset helper shape so the test suite expects branch data after login. The exact assertions should be added to the existing `returns the current member with lesson balance from a JWT` test after the existing user identity assertion:

```ts
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
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
pnpm --filter @booking/api test:e2e -- --runTestsByPath test/app.e2e-spec.ts
```

Expected: FAIL because `accessibleBranches` and `defaultBranchId` do not exist yet.

- [ ] **Step 3: Update Prisma schema**

Modify `apps/api/prisma/schema.prisma` with these model and enum changes:

```prisma
enum StaffRole {
  OWNER
  MANAGER
  COACH
}

model Gym {
  id        String   @id @default(cuid())
  name      String
  status    UserStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  branches  Branch[]
}

model Branch {
  id               String                  @id @default(cuid())
  gymId            String
  name             String
  address          String?
  phone            String?
  status           UserStatus              @default(ACTIVE)
  createdAt        DateTime                @default(now())
  updatedAt        DateTime                @updatedAt
  gym              Gym                     @relation(fields: [gymId], references: [id])
  memberBranches   MemberBranch[]
  staffAssignments StaffBranchAssignment[]
  classes          BoxingClass[]
  bookings         Booking[]
  lessonBalances   LessonBalance[]
  lessonDeductions LessonDeduction[]
  notificationJobs NotificationJob[]

  @@index([gymId])
}

model MemberBranch {
  id        String     @id @default(cuid())
  gymId     String
  branchId  String
  userId    String
  memberNo  String?
  status    UserStatus @default(ACTIVE)
  isDefault Boolean    @default(false)
  joinedAt  DateTime   @default(now())
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  user      User       @relation(fields: [userId], references: [id])
  branch    Branch     @relation(fields: [branchId], references: [id])

  @@unique([userId, branchId])
  @@index([gymId])
  @@index([branchId])
}

model StaffBranchAssignment {
  id        String     @id @default(cuid())
  gymId     String
  branchId  String
  userId    String
  role      StaffRole
  startsAt  DateTime
  endsAt    DateTime?
  status    UserStatus @default(ACTIVE)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  user      User       @relation(fields: [userId], references: [id])
  branch    Branch     @relation(fields: [branchId], references: [id])

  @@index([userId, role])
  @@index([branchId, role])
  @@index([gymId])
}
```

Update existing models with these fields and relations:

```prisma
model User {
  id                     String                  @id @default(cuid())
  role                   UserRole
  status                 UserStatus              @default(ACTIVE)
  displayName            String
  phone                  String?                 @unique
  username               String?                 @unique
  passwordHash           String?
  createdAt              DateTime                @default(now())
  updatedAt              DateTime                @updatedAt
  wechatAccounts         WechatAccount[]
  bookings               Booking[]
  lessonBalances         LessonBalance[]
  lessonDeductions       LessonDeduction[]       @relation("MemberDeductions")
  adminDeductions        LessonDeduction[]       @relation("AdminDeductions")
  memberBranches         MemberBranch[]
  staffBranchAssignments StaffBranchAssignment[]
  coachedClasses         BoxingClass[]           @relation("ClassCoach")
}

model BoxingClass {
  gymId             String
  branchId          String
  coachId           String?
  coachNameSnapshot String
  branch            Branch @relation(fields: [branchId], references: [id])
  coachUser         User?  @relation("ClassCoach", fields: [coachId], references: [id])

  @@index([gymId])
  @@index([branchId, startsAt])
  @@index([coachId])
}

model Booking {
  gymId    String
  branchId String
  branch   Branch @relation(fields: [branchId], references: [id])

  @@index([gymId])
  @@index([branchId])
}

model LessonBalance {
  gymId    String
  branchId String
  branch   Branch @relation(fields: [branchId], references: [id])

  @@unique([userId, branchId])
}

model LessonDeduction {
  gymId    String
  branchId String
  branch   Branch @relation(fields: [branchId], references: [id])

  @@index([gymId])
  @@index([branchId])
}

model NotificationJob {
  gymId    String
  branchId String
  branch   Branch @relation(fields: [branchId], references: [id])

  @@index([gymId])
  @@index([branchId])
}
```

Remove the old `LessonBalance.userId @unique` constraint after adding `@@unique([userId, branchId])`.
Replace the old singular `User.lessonBalance` relation with `User.lessonBalances`.

- [ ] **Step 4: Run Prisma formatting and generation**

Run:

```bash
pnpm --filter @booking/api exec prisma format
pnpm --filter @booking/api prisma:generate
```

Expected: Prisma schema formats and client generates without errors.

- [ ] **Step 5: Update seed data**

Modify `apps/api/prisma/seed.ts` so it creates:

- `Gym` named `拳馆约课`
- branches `城东店` and `城西店`
- admin owner `馆长`
- manager `东店店长`
- coach `Coach Leo`
- member `阿杰` in `城东店`
- member `小林` in `城西店`
- branch-scoped lesson balances
- classes in both branches with `coachNameSnapshot`

Use stable upserts by unique fields that already exist, such as admin username and member phone. For branch and gym records, use `findFirst` followed by `create` if no unique name constraint is added.

- [ ] **Step 6: Create migration**

Run:

```bash
pnpm --filter @booking/api prisma:migrate -- --name multi_branch
```

Expected: migration succeeds against local MySQL and Prisma Client regenerates.

- [ ] **Step 7: Commit schema and seed changes**

Run:

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/seed.ts apps/api/prisma/migrations apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): add multi-branch data model"
```

## Task 2: Add Branch Access Module

**Files:**
- Create: `apps/api/src/branches/branch-scope.types.ts`
- Create: `apps/api/src/branches/branch-access.service.ts`
- Create: `apps/api/src/branches/branch-view.mapper.ts`
- Create: `apps/api/src/branches/branches.controller.ts`
- Create: `apps/api/src/branches/branches.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Add failing branch access tests**

Add tests that log in `member-a` and `admin`, then assert:

```ts
const memberBranches = await request(app.getHttpServer())
  .get('/branches/me')
  .set('Authorization', `Bearer ${memberToken}`)
  .expect(200);

expect(memberBranches.body).toEqual([
  expect.objectContaining({
    name: '城东店',
    lessonBalance: { remaining: 10 }
  })
]);

const adminBranches = await request(app.getHttpServer())
  .get('/admin/branches')
  .set('Authorization', `Bearer ${adminToken}`)
  .expect(200);

expect(adminBranches.body.map((branch: { name: string }) => branch.name).sort()).toEqual(['城东店', '城西店']);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
pnpm --filter @booking/api test:e2e -- --runTestsByPath test/app.e2e-spec.ts
```

Expected: FAIL because branch controllers do not exist.

- [ ] **Step 3: Create branch scope types**

Create `apps/api/src/branches/branch-scope.types.ts`:

```ts
import { StaffRole } from '@prisma/client';

export type BranchAccessRole = StaffRole;

export type BranchView = {
  id: string;
  gymId: string;
  name: string;
  address: string | null;
  phone: string | null;
};

export type MemberBranchView = BranchView & {
  isDefault: boolean;
  lessonBalance: { remaining: number };
};

export type AdminBranchView = BranchView & {
  staffRole: BranchAccessRole;
};

export type AdminBranchScope = {
  isOwner: boolean;
  branchIds: string[];
};
```

- [ ] **Step 4: Create branch view mapper**

Create `apps/api/src/branches/branch-view.mapper.ts` with focused mapping functions:

```ts
import { AdminBranchView, MemberBranchView } from './branch-scope.types';

export function toMemberBranchView(input: {
  isDefault: boolean;
  branch: { id: string; gymId: string; name: string; address: string | null; phone: string | null };
  lessonBalance: { remaining: number } | null;
}): MemberBranchView {
  return {
    id: input.branch.id,
    gymId: input.branch.gymId,
    name: input.branch.name,
    address: input.branch.address,
    phone: input.branch.phone,
    isDefault: input.isDefault,
    lessonBalance: { remaining: input.lessonBalance?.remaining ?? 0 }
  };
}

export function toAdminBranchView(input: {
  role: AdminBranchView['staffRole'];
  branch: { id: string; gymId: string; name: string; address: string | null; phone: string | null };
}): AdminBranchView {
  return {
    id: input.branch.id,
    gymId: input.branch.gymId,
    name: input.branch.name,
    address: input.branch.address,
    phone: input.branch.phone,
    staffRole: input.role
  };
}
```

- [ ] **Step 5: Create BranchAccessService**

Create `apps/api/src/branches/branch-access.service.ts` with these public methods:

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBranchScope } from './branch-scope.types';
import { toAdminBranchView, toMemberBranchView } from './branch-view.mapper';

@Injectable()
export class BranchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async listMemberBranches(userId: string) {
    const memberBranches = await this.prisma.memberBranch.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        branch: true
      },
      orderBy: [{ isDefault: 'desc' }, { joinedAt: 'asc' }]
    });

    return Promise.all(
      memberBranches.map(async (memberBranch) => {
        const lessonBalance = await this.prisma.lessonBalance.findUnique({
          where: { userId_branchId: { userId, branchId: memberBranch.branchId } }
        });
        return toMemberBranchView({ isDefault: memberBranch.isDefault, branch: memberBranch.branch, lessonBalance });
      })
    );
  }

  async listAdminBranches(userId: string) {
    const assignments = await this.prisma.staffBranchAssignment.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { branch: true },
      orderBy: { createdAt: 'asc' }
    });

    return assignments.map((assignment) => toAdminBranchView({ role: assignment.role, branch: assignment.branch }));
  }

  async ensureMemberBranchAccess(userId: string, branchId: string) {
    const memberBranch = await this.prisma.memberBranch.findUnique({
      where: { userId_branchId: { userId, branchId } }
    });
    if (!memberBranch || memberBranch.status !== 'ACTIVE') {
      throw new ForbiddenException('Member cannot access this branch');
    }
    return memberBranch;
  }

  async resolveAdminBranchScope(userId: string, requestedBranchId?: string): Promise<AdminBranchScope> {
    const assignments = await this.prisma.staffBranchAssignment.findMany({
      where: { userId, status: 'ACTIVE' }
    });
    const isOwner = assignments.some((assignment) => assignment.role === StaffRole.OWNER);
    const branchIds = assignments.map((assignment) => assignment.branchId);

    if (branchIds.length === 0) {
      throw new ForbiddenException('Admin has no branch access');
    }
    if (requestedBranchId && !isOwner && !branchIds.includes(requestedBranchId)) {
      throw new ForbiddenException('Admin cannot access this branch');
    }
    return { isOwner, branchIds: requestedBranchId ? [requestedBranchId] : branchIds };
  }

  async ensureAdminBranchRole(userId: string, branchId: string, allowedRoles: StaffRole[]) {
    const assignment = await this.prisma.staffBranchAssignment.findFirst({
      where: { userId, branchId, status: 'ACTIVE', role: { in: allowedRoles } }
    });
    if (!assignment) {
      throw new ForbiddenException('Admin cannot manage this branch');
    }
    return assignment;
  }

  async ensureBranchExists(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }
}
```

This service depends on the relation and compound unique names from Task 1: `memberBranch`, `staffBranchAssignment`, `userId_branchId`, and `branch`.

- [ ] **Step 6: Create controllers and module**

Create `apps/api/src/branches/branches.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BranchAccessService } from './branch-access.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchAccess: BranchAccessService) {}

  @Get('me')
  listMine(@CurrentUser() user: JwtUser) {
    return this.branchAccess.listMemberBranches(user.sub);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/branches')
export class AdminBranchesController {
  constructor(private readonly branchAccess: BranchAccessService) {}

  @Get()
  listAdminBranches(@CurrentUser() user: JwtUser) {
    return this.branchAccess.listAdminBranches(user.sub);
  }
}
```

Create `apps/api/src/branches/branches.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminBranchesController, BranchesController } from './branches.controller';
import { BranchAccessService } from './branch-access.service';

@Module({
  imports: [PrismaModule],
  controllers: [BranchesController, AdminBranchesController],
  providers: [BranchAccessService],
  exports: [BranchAccessService]
})
export class BranchesModule {}
```

Import `BranchesModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
pnpm test
```

Expected: branch endpoint tests pass. Auth branch-context assertions that target `/auth/me` can remain failing until Task 3.

Commit:

```bash
git add apps/api/src/branches apps/api/src/app.module.ts apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): add branch access module"
```

## Task 3: Return Branch Context From Auth

**Files:**
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Finish failing auth tests**

Ensure the existing `/auth/me` and `/auth/dev-login` assertions expect:

```ts
expect(response.body.user ?? response.body).toEqual(
  expect.objectContaining({
    accessibleBranches: expect.arrayContaining([
      expect.objectContaining({ name: '城东店', lessonBalance: { remaining: 10 } })
    ]),
    defaultBranchId: expect.any(String)
  })
);
```

- [ ] **Step 2: Inject BranchAccessService into AuthService**

Modify `apps/api/src/auth/auth.module.ts` to import `BranchesModule`:

```ts
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-before-production',
        signOptions: { expiresIn: '7d' }
      })
    }),
    BranchesModule
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService]
})
export class AuthModule {}
```

Retain the `ConfigService`, `JwtModule`, and `PassportModule` imports from the current file. Add `BranchesModule` from `../branches/branches.module`.

- [ ] **Step 3: Add branch fields to public user mapping**

Modify `apps/api/src/auth/auth.service.ts` so user queries no longer include the old singular `lessonBalance` relation and `createSession` and `getMe` await branch context:

```ts
private async createSession(user: User) {
  const payload: JwtUser = {
    sub: user.id,
    role: user.role,
    displayName: user.displayName
  };

  return {
    accessToken: this.jwt.sign(payload),
    user: await this.toPublicUser(user)
  };
}

private async toPublicUser(user: User) {
  const accessibleBranches =
    user.role === UserRole.USER
      ? await this.branchAccess.listMemberBranches(user.id)
      : await this.branchAccess.listAdminBranches(user.id);

  const defaultBranch = accessibleBranches.find((branch) => 'isDefault' in branch && branch.isDefault) ?? accessibleBranches[0];
  const defaultLessonBalance =
    defaultBranch && 'lessonBalance' in defaultBranch ? defaultBranch.lessonBalance : null;

  return {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    phone: user.phone,
    lessonBalance: defaultLessonBalance,
    accessibleBranches,
    defaultBranchId: defaultBranch?.id ?? null
  };
}
```

Add `private readonly branchAccess: BranchAccessService` to the constructor.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
pnpm test
```

Expected: auth branch-context tests pass.

Commit:

```bash
git add apps/api/src/auth apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): return branch context from auth"
```

## Task 4: Make Class APIs Branch Scoped

**Files:**
- Modify: `apps/api/src/classes/dto.ts`
- Modify: `apps/api/src/classes/classes.controller.ts`
- Modify: `apps/api/src/classes/classes.service.ts`
- Test: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Add failing class isolation tests**

Add tests proving:

```ts
await request(app.getHttpServer())
  .get(`/classes?branchId=${westBranchId}`)
  .set('Authorization', `Bearer ${memberAToken}`)
  .expect(403);

const eastClasses = await request(app.getHttpServer())
  .get(`/classes?branchId=${eastBranchId}`)
  .set('Authorization', `Bearer ${memberAToken}`)
  .expect(200);
expect(eastClasses.body.every((boxingClass: { branchId: string }) => boxingClass.branchId === eastBranchId)).toBe(true);
```

Also add a manager test that cannot create a class in an unassigned branch.

- [ ] **Step 2: Update DTOs**

In `apps/api/src/classes/dto.ts`, add:

```ts
@IsString()
@MinLength(1)
branchId!: string;

@IsOptional()
@IsString()
@MinLength(1)
coachId?: string;
```

to `CreateClassDto`. Add optional `coachId` to `UpdateClassDto`. Do not make `branchId` editable in `UpdateClassDto`; moving a class across branches is out of scope.

- [ ] **Step 3: Update controllers**

Member list:

```ts
@Get()
listAvailable(@CurrentUser() user: JwtUser, @Query('branchId') branchId: string) {
  return this.classes.listAvailable(user.sub, branchId);
}
```

Admin list:

```ts
@Get()
listAdmin(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
  return this.classes.listAdmin(user.sub, branchId);
}
```

Admin create:

```ts
@Post()
create(@CurrentUser() user: JwtUser, @Body() dto: CreateClassDto) {
  return this.classes.create(user.sub, dto);
}
```

Pass `user.sub` into update and cancel as well.

- [ ] **Step 4: Update ClassesService**

Inject `BranchAccessService`. Public method signatures must be:

```ts
async listAvailable(userId: string, branchId: string)
async listAdmin(adminId: string, branchId?: string)
async create(adminId: string, dto: CreateClassDto)
async update(adminId: string, id: string, dto: UpdateClassDto)
async cancel(adminId: string, id: string)
```

Rules:

- `listAvailable` calls `ensureMemberBranchAccess`.
- `listAdmin` calls `resolveAdminBranchScope`.
- `create` calls `ensureAdminBranchRole(adminId, dto.branchId, ['OWNER', 'MANAGER'])`.
- If `coachId` exists, verify active `COACH` assignment for `dto.branchId`.
- `update` and `cancel` load the class and verify admin access to that class branch.
- `toClassView` includes `gymId`, `branchId`, `branchName`, `coachId`, and `coach`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm test
```

Expected: class branch isolation and existing class behavior pass.

Commit:

```bash
git add apps/api/src/classes apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): scope classes by branch"
```

## Task 5: Make Booking APIs Branch Scoped

**Files:**
- Modify: `apps/api/src/bookings/dto.ts`
- Modify: `apps/api/src/bookings/bookings.controller.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Test: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Add failing booking isolation tests**

Add tests proving:

- Member A cannot book a Branch B class.
- Booking creation rejects mismatched `classId` and `branchId`.
- Booking creation rejects when branch-scoped balance is zero.
- `GET /bookings/me?branchId=...` returns only that branch.

Use assertions like:

```ts
await request(app.getHttpServer())
  .post('/bookings')
  .set('Authorization', `Bearer ${memberAToken}`)
  .send({ classId: westClassId, branchId: westBranchId })
  .expect(403);

await request(app.getHttpServer())
  .post('/bookings')
  .set('Authorization', `Bearer ${memberAToken}`)
  .send({ classId: eastClassId, branchId: westBranchId })
  .expect(400);
```

- [ ] **Step 2: Update booking DTO**

In `apps/api/src/bookings/dto.ts`, add required `branchId`:

```ts
@IsString()
@MinLength(1)
branchId!: string;
```

- [ ] **Step 3: Update controller signatures**

Use query branch for list:

```ts
@Get('me')
listMine(@CurrentUser() user: JwtUser, @Query('branchId') branchId: string) {
  return this.bookings.listMine(user.sub, branchId);
}
```

Keep create body with `branchId`. For cancel:

```ts
@Post(':id/cancel')
@HttpCode(200)
cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
  return this.bookings.cancelBooking(user.sub, id);
}
```

Cancellation can derive branch from booking and then check member access.

- [ ] **Step 4: Update booking service rules**

`createBooking` transaction must:

- Call `ensureMemberBranchAccess(userId, dto.branchId)`.
- Load class by `dto.classId` including active bookings.
- Reject if `boxingClass.branchId !== dto.branchId`.
- Load `lessonBalance` by `(userId, dto.branchId)`.
- Reject if missing or `remaining <= 0`.
- Create booking with `gymId` and `branchId`.
- Create reminder job with `gymId` and `branchId`.

Use clear helper names:

```ts
private assertClassBelongsToBranch(classBranchId: string, requestedBranchId: string) {
  if (classBranchId !== requestedBranchId) {
    throw new BadRequestException('Class does not belong to requested branch');
  }
}
```

- [ ] **Step 5: Update notification service**

Change reminder creation input to include:

```ts
type CreateReminderInput = {
  bookingId: string;
  userId: string;
  gymId: string;
  branchId: string;
  classStartsAt: Date;
  remindBeforeMinutes: number;
};
```

Persist `gymId` and `branchId` in `notificationJob.create`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm test
```

Expected: booking branch isolation, balance checks, capacity, duplicate booking, cancellation, and notification job tests pass.

Commit:

```bash
git add apps/api/src/bookings apps/api/src/notifications apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): scope bookings by branch"
```

## Task 6: Make Admin Booking And Deduction APIs Branch Scoped

**Files:**
- Modify: `apps/api/src/lesson-deductions/dto.ts`
- Modify: `apps/api/src/lesson-deductions/lesson-deductions.controller.ts`
- Modify: `apps/api/src/lesson-deductions/lesson-deductions.service.ts`
- Test: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Add failing admin branch permission tests**

Add tests proving:

- Branch manager for `城东店` can list and deduct `城东店` bookings.
- Branch manager for `城东店` cannot list or deduct `城西店` bookings.
- Owner can list all bookings when `branchId` is omitted.
- Deduction decrements only `(userId, branchId)` balance.

- [ ] **Step 2: Update DTOs**

In `AdminBookingQueryDto`, add:

```ts
@IsOptional()
@IsString()
branchId?: string;
```

For member deduction listing, use query `branchId` in controller rather than a new DTO if the controller remains simple.

- [ ] **Step 3: Update controller signatures**

Admin bookings:

```ts
list(@CurrentUser() user: JwtUser, @Query() query: AdminBookingQueryDto) {
  return this.lessonDeductions.listAdminBookings(user.sub, query);
}
```

Admin deductions:

```ts
listAdminDeductions(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
  return this.lessonDeductions.listAdminDeductions(user.sub, branchId);
}
```

Member deductions:

```ts
listMine(@CurrentUser() user: JwtUser, @Query('branchId') branchId: string) {
  return this.lessonDeductions.listMine(user.sub, branchId);
}
```

- [ ] **Step 4: Update service rules**

Inject `BranchAccessService`.

Admin list:

- Call `resolveAdminBranchScope(adminId, query.branchId)`.
- Apply `where.branchId = { in: scope.branchIds }`.
- Keep search filters nested under `AND` so branch scope cannot be bypassed by `OR`.

Deduct:

- Load booking with branch, user balance for `booking.branchId`, and existing deduction.
- Call `ensureAdminBranchRole(adminId, booking.branchId, ['OWNER', 'MANAGER'])`.
- Create deduction with `gymId` and `branchId`.
- Update `lessonBalance` by `userId_branchId`.
- Keep deduction creation, balance decrement, and attendance update in one transaction.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm test
```

Expected: admin branch scope, manager restrictions, owner all-branch view, duplicate deduction, and balance decrement tests pass.

Commit:

```bash
git add apps/api/src/lesson-deductions apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): scope admin deductions by branch"
```

## Task 7: Update Mini Program For Branch Selection

**Files:**
- Modify: `apps/miniapp/src/types.ts`
- Modify: `apps/miniapp/src/api.ts`
- Modify: `apps/miniapp/src/pages/classes/index.tsx`
- Modify: `apps/miniapp/src/pages/bookings/index.tsx`
- Modify: `apps/miniapp/src/pages/profile/index.tsx`
- Modify: `apps/miniapp/src/app.scss`
- Modify: `apps/miniapp/src/pages/classes/index.scss`
- Modify: `apps/miniapp/src/pages/bookings/index.scss`
- Modify: `apps/miniapp/src/pages/profile/index.scss`

- [ ] **Step 1: Update mini program types**

Add:

```ts
export type MemberBranch = {
  id: string;
  gymId: string;
  name: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  lessonBalance: { remaining: number };
};
```

Update `AuthUser` to include:

```ts
accessibleBranches: MemberBranch[];
defaultBranchId: string | null;
```

Update `BoxingClass`, `Booking`, and `Deduction` types to include `branchId` and optional branch display data returned by API.

- [ ] **Step 2: Update API helpers**

Add storage key:

```ts
const BRANCH_KEY = 'selected_branch_id';
```

Add helpers:

```ts
export function getStoredBranchId() {
  return Taro.getStorageSync<string>(BRANCH_KEY) || '';
}

export function setStoredBranchId(branchId: string) {
  Taro.setStorageSync(BRANCH_KEY, branchId);
}

export function getMyBranches(token: string) {
  return requestJson<MemberBranch[]>('/branches/me', { token });
}
```

Update class, booking, and deduction calls:

```ts
export function getClasses(token: string, branchId: string) {
  return requestJson<BoxingClass[]>(`/classes?branchId=${encodeURIComponent(branchId)}`, { token });
}
```

Apply the same query pattern to `getMyBookings` and `getMyDeductions`. Add `branchId` to `createBooking`.

- [ ] **Step 3: Update classes page**

Use state names:

```ts
const [accessibleBranches, setAccessibleBranches] = useState<MemberBranch[]>([]);
const [selectedBranchId, setSelectedBranchId] = useState(getStoredBranchId());
```

After login, choose:

```ts
const nextBranchId = getStoredBranchId() || session.user.defaultBranchId || session.user.accessibleBranches[0]?.id || '';
setSelectedBranchId(nextBranchId);
setStoredBranchId(nextBranchId);
```

Render branch buttons only when `accessibleBranches.length > 1`.

Call `getClasses(session.accessToken, nextBranchId)` and `createBooking(token, boxingClass.id, selectedBranchId, reminder ? 120 : undefined)`.

- [ ] **Step 4: Update bookings and profile pages**

Both pages must:

- Resolve token.
- Resolve selected branch from storage or user default branch.
- Use branch-scoped API calls.
- Show current branch name in the hero subtitle.

Do not duplicate branch resolution logic more than twice. If duplication grows, create `apps/miniapp/src/branch-session.ts` with `resolveMemberSessionBranch`.

- [ ] **Step 5: Run mini program build**

Run:

```bash
pnpm --filter @booking/miniapp build:weapp
```

Expected: Taro build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/src
git commit -m "feat(miniapp): add branch-scoped booking experience"
```

## Task 8: Update Admin Web For Branch Filtering

**Files:**
- Modify: `apps/admin/src/types.ts`
- Modify: `apps/admin/src/api.ts`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/styles.css`

- [ ] **Step 1: Update admin types**

Add:

```ts
export type AdminBranch = {
  id: string;
  gymId: string;
  name: string;
  address: string | null;
  phone: string | null;
  staffRole: 'OWNER' | 'MANAGER' | 'COACH';
};
```

Update class input:

```ts
export type CreateClassInput = {
  branchId: string;
  coachId?: string;
  title: string;
  coachNameSnapshot?: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  description: string;
};
```

Update booking, class, and deduction response types with `branchId` and `branch`.

- [ ] **Step 2: Update admin API helpers**

Add:

```ts
export function getAdminBranches(token: string) {
  return requestJson<AdminBranch[]>('/admin/branches', { token });
}
```

Update list helpers to accept `branchId` and append query parameters with `URLSearchParams`.

- [ ] **Step 3: Update App state**

Add:

```ts
const [branches, setBranches] = useState<AdminBranch[]>([]);
const [selectedBranchId, setSelectedBranchId] = useState('');
```

In `refreshAll`, load branches first when missing, then pass `selectedBranchId` to booking, class, and deduction fetches.

- [ ] **Step 4: Add branch selector UI**

Add selector near the topbar or tabs:

```tsx
<Select
  className="branch-select"
  value={selectedBranchId}
  onChange={(value) => setSelectedBranchId(value)}
  options={[
    ...(branches.some((branch) => branch.staffRole === 'OWNER') ? [{ value: '', label: '全部门店' }] : []),
    ...branches.map((branch) => ({ value: branch.id, label: branch.name }))
  ]}
/>
```

For class creation, require `branchId`. Default the form branch to the selected branch or the first accessible branch.

- [ ] **Step 5: Run admin build**

Run:

```bash
pnpm --filter @booking/admin build
```

Expected: TypeScript and Vite build succeed.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): add branch-scoped operations"
```

## Task 9: Full Verification And Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/manual-test-checklist.md`
- Test: full repo

- [ ] **Step 1: Update README development accounts**

Document:

```text
Owner/admin: admin / admin123456
Branch manager: east-manager / manager123456
Members:
- member-a: 阿杰 / 城东店 / 10 lessons
- member-b: 小林 / 城西店 / 6 lessons
```

Also document that member balances are branch-scoped.

- [ ] **Step 2: Update manual checklist**

Add manual checks:

- Owner sees all branches in admin.
- Manager sees only assigned branch.
- Member A cannot see Member B branch data.
- Mini program branch selector appears for multi-branch member and is hidden for single-branch member.
- Deduction decrements only the branch balance.

- [ ] **Step 3: Run full checks**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected:

- API typecheck passes.
- Admin typecheck passes.
- API e2e tests pass.
- API build passes.
- Admin Vite build passes.
- Taro WeApp build passes.

- [ ] **Step 4: Browser smoke test admin**

Run local services:

```bash
pnpm api:dev
pnpm admin:dev
```

Verify in browser:

- Login page renders.
- Admin login succeeds.
- Branch selector renders.
- Switching branch changes visible class/booking rows.
- Narrow viewport does not produce document-level horizontal overflow.

- [ ] **Step 5: Commit docs**

```bash
git add README.md docs/manual-test-checklist.md
git commit -m "docs: update multi-branch verification guide"
```

## Completion Criteria

The implementation is complete only when all of these are true:

- `pnpm lint` passes.
- `pnpm test` passes with branch isolation e2e coverage.
- `pnpm build` passes.
- Member APIs reject cross-branch reads and writes.
- Admin APIs enforce owner and manager branch scope.
- Lesson deduction decrements only branch-scoped balance.
- Coach transfer seed data preserves historical classes.
- Mini program uses selected member branch for classes, bookings, balances, and deductions.
- Admin web uses branch selector for classes, bookings, and deductions.
- No new empty functions, temporary service methods, or vague branch access helpers are introduced.

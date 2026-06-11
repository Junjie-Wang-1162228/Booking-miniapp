# Real WeChat Login Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real WeChat mini program login path that maps `wx.login` codes to local users through `WechatAccount`, auto-creates test members for new openids, keeps dev login available, and verifies the full booking-to-deduction flow.

**Architecture:** Reuse the existing JWT/session shape and branch-scoped domain model. Add `POST /auth/wechat-login` beside `POST /auth/dev-login`; the endpoint exchanges a code for openid, finds or creates a member, and returns the same `AuthResponse`. The mini program chooses WeChat login by default via a build-time `TARO_APP_AUTH_MODE` constant, while `dev` mode keeps the member switcher for local debugging.

**Tech Stack:** NestJS, Prisma/MySQL, Jest/Supertest, Taro/React mini program, WeChat `wx.login` and `code2Session`.

---

## File Structure

- Modify `apps/api/src/auth/dto.ts`: add `WechatLoginDto`.
- Modify `apps/api/src/auth/auth.controller.ts`: expose `POST /auth/wechat-login`.
- Modify `apps/api/src/auth/auth.service.ts`: add WeChat code exchange, auto-provisioning, and session creation.
- Modify `apps/api/test/app.e2e-spec.ts`: add test env setup, clear `WechatAccount`, and real-login tests.
- Modify `apps/miniapp/config/index.ts`: define `__AUTH_MODE__`.
- Modify `apps/miniapp/src/env.d.ts`: declare `__AUTH_MODE__`.
- Modify `apps/miniapp/src/api.ts`: add `wechatLogin`, token helpers, and auth mode helper.
- Modify `apps/miniapp/src/pages/classes/index.tsx`: use WeChat login by default and show member switcher only in dev mode.
- Modify `apps/miniapp/src/pages/bookings/index.tsx`: ensure session through WeChat login by default.
- Modify `apps/miniapp/src/pages/profile/index.tsx`: use WeChat login by default and show switcher only in dev mode.
- Modify `README.md` and `docs/manual-test-checklist.md`: document real WeChat testing path and fallback dev mode.

## Task 1: Backend E2E Tests

**Files:**
- Modify: `apps/api/test/app.e2e-spec.ts`

- [ ] **Step 1: Add test environment defaults before Nest app setup**

Add these assignments near the top of the `describe` block, before `beforeAll` compiles `AppModule`:

```ts
process.env.MINIAPP_APP_ID = 'test-miniapp';
process.env.WECHAT_LOGIN_MOCK_ENABLED = 'true';
process.env.WECHAT_AUTO_PROVISION_ENABLED = 'true';
process.env.WECHAT_AUTO_PROVISION_LESSONS = '10';
process.env.WECHAT_AUTO_PROVISION_BRANCH_NAME = '城东店';
```

- [ ] **Step 2: Clear existing WeChat account rows in reset data**

In `resetTestData`, add this before deleting branch-scoped data:

```ts
await prisma.wechatAccount.deleteMany();
```

- [ ] **Step 3: Add auth tests for WeChat login**

Add tests after the existing dev-login auth test:

```ts
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
```

- [ ] **Step 4: Add booking-to-deduction test for auto-provisioned WeChat user**

Add this in the bookings or deduction section using existing helpers:

```ts
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
```

- [ ] **Step 5: Run tests and verify RED**

Run:

```bash
pnpm --filter @booking/api test:e2e -- --runTestsByPath test/app.e2e-spec.ts
```

Expected: FAIL because `/auth/wechat-login` is not implemented.

## Task 2: Backend WeChat Login Implementation

**Files:**
- Modify: `apps/api/src/auth/dto.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.service.ts`

- [ ] **Step 1: Add DTO**

```ts
export class WechatLoginDto {
  @IsString()
  @MinLength(1)
  code!: string;
}
```

- [ ] **Step 2: Add controller endpoint**

Import `WechatLoginDto` and add:

```ts
@Post('wechat-login')
wechatLogin(@Body() dto: WechatLoginDto) {
  return this.auth.wechatLogin(dto.code);
}
```

- [ ] **Step 3: Implement service methods**

In `AuthService`, inject `ConfigService`, add `ForbiddenException`, and implement:

```ts
async wechatLogin(code: string) {
  const session = await this.exchangeWechatCode(code);
  const appId = this.getMiniappAppId();
  const existingAccount = await this.prisma.wechatAccount.findUnique({
    where: { appId_openid: { appId, openid: session.openid } },
    include: { user: true }
  });

  if (existingAccount) {
    return this.createSession(existingAccount.user);
  }

  if (!this.isEnabled('WECHAT_AUTO_PROVISION_ENABLED', true)) {
    throw new ForbiddenException('Wechat account is not bound to a member');
  }

  const user = await this.autoProvisionWechatMember(appId, session.openid, session.unionid);
  return this.createSession(user);
}
```

Add helpers for `exchangeWechatCode`, mock mode, real `fetch`, display name suffix, branch selection, lesson balance parsing, and boolean config parsing.

- [ ] **Step 4: Run backend e2e tests**

Run:

```bash
pnpm --filter @booking/api test:e2e
```

Expected: PASS.

## Task 3: Mini Program Login Switch

**Files:**
- Modify: `apps/miniapp/config/index.ts`
- Modify: `apps/miniapp/src/env.d.ts`
- Modify: `apps/miniapp/src/api.ts`
- Modify: `apps/miniapp/src/pages/classes/index.tsx`
- Modify: `apps/miniapp/src/pages/bookings/index.tsx`
- Modify: `apps/miniapp/src/pages/profile/index.tsx`

- [ ] **Step 1: Add build constant**

Define `authMode` from `TARO_APP_AUTH_MODE || 'wechat'` and add:

```ts
__AUTH_MODE__: JSON.stringify(authMode)
```

- [ ] **Step 2: Add API helpers**

Add `wechatLogin`, `ensureMemberSession`, `isDevAuthMode`, and `clearStoredToken` in `apps/miniapp/src/api.ts`.

- [ ] **Step 3: Update pages**

Replace direct `devLogin` bootstrapping with `ensureMemberSession`. Keep `switchMember` and member switch buttons visible only when `isDevAuthMode()` returns true.

- [ ] **Step 4: Build mini program**

Run:

```bash
pnpm --filter @booking/miniapp build:weapp
```

Expected: PASS and `dist/app.js` contains `wechat-login`.

## Task 4: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/manual-test-checklist.md`

- [ ] **Step 1: Update docs**

Document:

- Required `MINIAPP_APP_ID`.
- Required `MINIAPP_APP_SECRET` for real WeChat exchange.
- Mock mode for local automated tests.
- `TARO_APP_AUTH_MODE=dev` for old member switcher.
- Manual WeChat DevTools account testing flow.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm lint
pnpm build
```

Expected: all exit 0.

- [ ] **Step 3: Commit implementation**

```bash
git add apps/api/src/auth apps/api/test/app.e2e-spec.ts apps/miniapp/config/index.ts apps/miniapp/src docs/manual-test-checklist.md README.md
git commit -m "feat: add wechat login auto provisioning"
```

## Self-Review

- Spec coverage: API endpoint, config, auto-provisioning, dev fallback, mini program switch, notification job preservation, backend tests, manual checklist, and final verification are covered.
- Completion-marker scan: no task contains unfinished work markers.
- Type consistency: endpoint is `POST /auth/wechat-login`, DTO is `WechatLoginDto`, miniapp helper is `wechatLogin`, and the auth mode constant is `__AUTH_MODE__`.

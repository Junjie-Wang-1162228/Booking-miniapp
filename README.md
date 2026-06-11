# Boxing Booking Miniapp

MVP for a boxing gym booking mini program and admin dashboard.

The current MVP supports one gym with multiple branches. Branch-scoped records include classes, bookings, lesson balances, lesson deductions, and notification jobs. Members only see branches they belong to. Admin staff access is controlled through branch assignments: owners can operate across all branches, while managers operate only inside assigned branches.

## Local Development

1. Copy `.env.example` to `apps/api/.env`.
2. Start MySQL with `pnpm dev:db`.
3. Run API migrations and seed data with `pnpm --filter @booking/api prisma:migrate` and `pnpm --filter @booking/api prisma:seed`.
4. Start the API with `pnpm api:dev`.
5. Start admin with `pnpm admin:dev`.
6. Start mini program build with `pnpm miniapp:dev`.

For real WeChat-account testing, set `MINIAPP_APP_ID` and `MINIAPP_APP_SECRET` in `apps/api/.env`, then restart the API. The current local `.env` is prepared for AppID `wxcb2a788d3230d901`; fill the matching AppSecret from the WeChat mini program management console before using real `wx.login`.

## Useful Commands

```bash
pnpm dev:db
cp .env.example apps/api/.env
pnpm --filter @booking/api prisma:migrate
pnpm --filter @booking/api prisma:seed
pnpm api:dev
pnpm admin:dev
pnpm miniapp:dev
```

Run the old fake-member mini program mode when you need local debugging without WeChat login:

```bash
TARO_APP_AUTH_MODE=dev pnpm miniapp:dev
```

Run automated checks:

```bash
pnpm test
pnpm lint
pnpm build
```

## Development Accounts

Admin dashboard:

```text
URL: http://localhost:5173
Username: admin
Password: admin123456

Username: east-manager
Password: manager123456
```

Mini program MVP members:

```text
member-a: 阿杰 / 18800000001 / 城东店 / 10 lessons
member-b: 小林 / 18800000002 / 城西店 / 6 lessons
member-c: 东店同学 / 18800000003 / 城东店 / 4 lessons
```

The mini program now defaults to `POST /auth/wechat-login`. It calls `Taro.login`, sends the returned code to the API, and the API maps the resulting `(MINIAPP_APP_ID, openid)` to a local member through `WechatAccount`.

During this internal rollout, unknown WeChat accounts are auto-provisioned when `WECHAT_AUTO_PROVISION_ENABLED="true"`:

```text
Default branch: WECHAT_AUTO_PROVISION_BRANCH_NAME, or first active branch
Initial lessons: WECHAT_AUTO_PROVISION_LESSONS
Display name: 微信测试会员-<last6 of openid>
```

The old `POST /auth/dev-login` flow remains available by building the mini program with `TARO_APP_AUTH_MODE=dev`.

## Branch Isolation Checks

- Owner `admin` can select all branches in the web dashboard and can create classes in both `城东店` and `城西店`.
- Manager `east-manager` can list and deduct `城东店` bookings, but cannot operate `城西店`.
- `member-a` can list and book `城东店` classes, but cannot book `城西店` classes.
- Booking, deduction, lesson balance, and reminder data all carry `gymId` and `branchId`.

## Mini Program Build Note

In the Codex desktop macOS environment, the bundled Codex Node process cannot load some third-party native `.node` modules used by Taro. The mini program scripts prepend `/opt/homebrew/bin` to `PATH` so the Homebrew Node runtime is used for Taro commands.

If your machine uses a different Node location, update the `apps/miniapp/package.json` scripts or run:

```bash
PATH="/path/to/your/node/bin:$PATH" pnpm --filter @booking/miniapp build:weapp
```

## Production Launch Strategy

Use the developer's personal mini program account only for MVP development and internal trial. Formal release should use the boxing gym owner's business, company, or individual business owner mini program subject after certification, filing, privacy settings, server domain configuration, and service category review.

Do not treat the personal MVP AppID as the long-term identity. When moving to the gym-owned AppID, WeChat `openid` values can change, so use phone number or an internal member record as the durable business identity.

Before inviting external members, disable broad auto-provisioning or replace it with admin-managed member binding, and configure the production HTTPS request domain in the WeChat console.

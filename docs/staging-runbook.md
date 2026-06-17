# Staging 环境运行手册

最后更新：2026-06-13

本文档用于准备拳馆约课小程序的 staging 环境。staging 是正式上线前的验收环境，不等同于本地开发环境，也不能和 production 共用关键资源。

## 核心原则

staging 和 production 必须分开，至少包括：

- 独立数据库：使用 `boxing_booking_staging` 或等价命名，不得连接 production 数据库。
- 独立 API 域名：例如 `https://staging-api.example.com`，不得使用 production API 域名。
- 独立管理后台域名：例如 `https://staging-admin.example.com`，CORS 只允许 staging 管理后台。
- 独立小程序体验版：使用体验版、开发版或灰度测试入口，不直接影响线上正式版。
- 独立 secret：不得使用 production AppSecret、JWT secret、数据库密码、告警 token。
- 独立告警路由：staging 告警应打到测试频道，避免和 production 事故混淆。

## 环境变量基线

staging API 推荐配置：

```bash
NODE_ENV=production
JWT_SECRET=staging-random-secret
CORS_ORIGINS=https://staging-admin.example.com
DATABASE_URL=mysql://booking_app_staging:staging-pass@staging-db.example.com:3306/boxing_booking_staging
WECHAT_AUTO_PROVISION_ENABLED=false
MINIAPP_APP_ID=staging-or-test-appid
MINIAPP_APP_SECRET=staging-secret
WECHAT_BOOKING_CREATED_TEMPLATE_ID=staging-template-id
WECHAT_SUBSCRIBE_TEMPLATE_ID=staging-template-id
BUSINESS_TIMEZONE_OFFSET_MINUTES=480
ALERT_WEBHOOK_URL=https://alerts.example.com/staging/boxing-booking
ALERT_WEBHOOK_TOKEN=staging-alert-token
```

小程序体验版构建推荐配置：

```bash
TARO_APP_AUTH_MODE=wechat
TARO_APP_API_BASE_URL=https://staging-api.example.com
TARO_APP_WECHAT_BOOKING_CREATED_TEMPLATE_ID=staging-template-id
TARO_APP_WECHAT_SUBSCRIBE_TEMPLATE_ID=staging-template-id
TARO_APP_BUSINESS_TIMEZONE_OFFSET_MINUTES=480
```

API 和小程序的营业时区偏移必须一致，否则运营端“今日”统计和预约名单会出现错日。

## 部署前 No-Go

任一条件不满足时，不允许把该环境当作 staging 验收环境：

- `DATABASE_URL` 指向 production 数据库。
- API 或管理后台域名与 production 相同。
- staging 使用 production AppSecret、JWT secret、数据库密码或告警 token。
- `WECHAT_AUTO_PROVISION_ENABLED=true`。
- 未完成 Prisma migration。
- 未跑通过自动化检查和基础烟测。
- 小程序体验版没有指向 staging API 域名。

## 验证命令

使用 staging 环境变量运行：

```bash
pnpm lint
pnpm --filter @booking/api test:e2e
pnpm --filter @booking/api build
pnpm --filter @booking/admin build
cross-env TARO_APP_AUTH_MODE=wechat TARO_APP_BUSINESS_TIMEZONE_OFFSET_MINUTES=480 pnpm --filter @booking/miniapp build:weapp
pnpm security:check
pnpm ops:staging:test
pnpm miniapp:visual-qa
```

配置自检：

```bash
NODE_ENV=production \
JWT_SECRET=staging-random-secret \
CORS_ORIGINS=https://staging-admin.example.com \
DATABASE_URL=mysql://booking_app_staging:staging-pass@staging-db.example.com:3306/boxing_booking_staging \
WECHAT_AUTO_PROVISION_ENABLED=false \
pnpm --filter @booking/api config:check
```

健康检查：

```bash
curl -fsS https://staging-api.example.com/health
```

期望返回：

```json
{ "ok": true }
```

## 烟测范围

staging 至少完成以下验收：

- 管理员可以登录 staging 管理后台。
- 店长账号只能看到自己门店。
- 小程序体验版可以微信登录。
- 未绑定微信账号进入绑定码流程。
- 管理员可以创建会员并绑定微信。
- 会员只看到所属门店课程。
- 会员可以预约、取消、查看预约和消课记录。
- 管理后台可以查看今日课程名单并执行消课。
- 课程取消会取消有效预约，并生成课程取消通知任务。
- 通知失败记录可以在后台查看并重试。
- API 错误告警进入 staging 告警频道。

## 进入 Production 前

只有 staging 同 commit 完成构建、迁移、部署、烟测和观察后，才允许进入 production 发布清单。production 发布仍以 `docs/release-checklist.md` 为准。

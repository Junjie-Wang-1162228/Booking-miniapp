# 发布检查清单

最后更新：2026-06-13

本文档用于拳馆约课小程序每次 staging 或 production 发版。发布前必须确认当前环境变量、数据库、微信小程序主体和部署目标都指向本次要发布的环境。

## 适用范围

- API：`@booking/api`
- 管理后台：`@booking/admin`
- 微信小程序：`@booking/miniapp`
- 数据库：MySQL + Prisma migration
- 运维脚本：生产配置检查、备份、恢复、健康检查和烟测

staging 环境分离规则见 `docs/staging-runbook.md`。production 发布前必须先用同 commit 完成 staging 构建、迁移、部署、烟测和观察。

## Go / No-Go

只有以下条件全部满足，才允许继续发布：

- 代码来自已确认的 Git commit，并能对应到本次发布记录。
- staging 环境已经完成同版本构建、迁移、部署和烟测。
- 生产 `DATABASE_URL` 不指向 localhost、测试库、shadow 库或示例账号。
- 生产 `JWT_SECRET`、`CORS_ORIGINS`、微信 AppSecret、订阅消息模板 ID 等 secret 已配置在部署平台或受控 env-file。
- `WECHAT_AUTO_PROVISION_ENABLED=false`，未知微信账号走后台绑定流程。
- 发版前数据库备份已完成，并记录备份路径、时间、commit 和执行人。
- 回滚负责人、回滚窗口和恢复方案已确认。

任一条件不满足时，本次发布为 No-Go。

## 1. 构建与自动化检查

在本地运行以下命令；如已配置 CI，也必须确认 CI 同步通过。任何失败都应阻断发布：

```bash
pnpm verify
```

`pnpm verify` 是首选统一质量门禁，会覆盖 lint、API E2E、项目脚本测试、安全检查和三端构建。需要定位失败项时，可单独运行：

```bash
pnpm lint
pnpm --filter @booking/api test:e2e
pnpm --filter @booking/api build
pnpm --filter @booking/admin build
TARO_APP_AUTH_MODE=wechat pnpm --filter @booking/miniapp build:weapp
pnpm security:check
pnpm ops:staging:test
pnpm miniapp:visual-qa
```

说明：

- `pnpm miniapp:visual-qa` 只输出截图矩阵状态，不打开 WeChat DevTools。
- 不要在自动发布流水线里使用 `pnpm miniapp:visual-qa:capture`，它会通过 `miniprogram-automator` 打开 WeChat DevTools。
- 多设备截图矩阵仍以 `docs/miniapp-visual-qa.md` 和 `pnpm miniapp:visual-qa:check` 为准；截图未补齐时不影响代码构建，但应在外部试运营前完成。

## 2. 生产配置检查

发布前用生产环境变量运行配置自检：

```bash
NODE_ENV=production \
JWT_SECRET=production-secret-123 \
CORS_ORIGINS=https://admin.example.com \
DATABASE_URL=mysql://booking_app:prod-pass@db.example.com:3306/boxing_booking_prod \
WECHAT_AUTO_PROVISION_ENABLED=false \
pnpm --filter @booking/api config:check
```

检查重点：

- `JWT_SECRET` 不是默认值。
- `CORS_ORIGINS` 只包含管理后台可信域名。
- `DATABASE_URL` 使用低权限 API 运行账号，例如 `booking_app`。
- 数据库不是本地库、测试库或 shadow 库。
- 生产环境未开启宽松自动开户。
- 数据库侧实际权限已按 `docs/production-db-accounts.md` 执行 `SHOW GRANTS` 验收。

## 3. 数据库备份

发版前先做一次生产库备份：

```bash
pnpm db:backup -- --dry-run --env-file /secure/env/prod-backup.env
pnpm db:backup -- --env-file /secure/env/prod-backup.env --out /secure/backups/boxing-booking-$(date +%F-%H%M%S).sql
```

备份完成后记录：

- 备份文件路径。
- 备份完成时间。
- 本次 Git commit。
- 数据库名和环境。
- 执行人。
- dry-run 输出已脱敏，且没有泄漏 `MYSQL_PWD`。

## 4. 迁移

迁移必须使用迁移专用账号，不使用 API 运行账号或 root 账号。

先在 staging 或生产同结构临时库执行：

```bash
DATABASE_URL=mysql://booking_migrator:prod-pass@db.example.com:3306/boxing_booking_staging \
pnpm --filter @booking/api exec prisma migrate deploy
```

生产发布窗口内执行：

```bash
DATABASE_URL=mysql://booking_migrator:prod-pass@db.example.com:3306/boxing_booking_prod \
pnpm --filter @booking/api exec prisma migrate deploy
```

迁移后检查：

- Prisma migration 没有报错。
- 表结构与当前代码匹配。
- 没有执行 seed 测试数据。
- 如迁移包含破坏性变更，已提前确认只能通过备份恢复回滚。

## 5. 部署

建议顺序：

1. 暂停或降低写入流量，视发版风险决定是否进入维护窗口。
2. 执行数据库迁移。
3. 部署 API，并确认进程加载的是生产 secret。
4. 部署管理后台静态资源。
5. 使用正式 AppID 构建微信小程序，并通过微信开发者工具或既有小程序上传流程上传生产包。
6. 在微信后台提交体验版或正式审核前，确认 request 合法域名、隐私保护指引、服务类目和订阅消息模板。

API 部署完成后立即检查：

```bash
curl -fsS https://api.example.com/health
```

期望返回：

```json
{ "ok": true }
```

## 6. 烟测

发布后至少完成以下烟测：

- API `GET /health` 返回 `{ "ok": true }`。
- 管理后台可以登录。
- 店长账号只能看到自己门店数据。
- 小程序可以完成微信登录，未知账号进入绑定码流程。
- 会员可以查看当前门店课程列表和课程详情。
- 会员可以预约有余位课程。
- 会员可以在截止时间前取消预约。
- 后台可以查看今日课程名单。
- 后台可以对有效预约执行消课。
- 后台可以手动取消会员预约。
- 通知任务列表可以查看失败记录，失败任务可重试。
- 审计日志能记录关键后台操作。

烟测失败时停止扩大流量，先判断是否需要回滚。

## 7. 回滚

回滚分应用回滚和数据库恢复两类。

应用回滚：

- 保留上一版 API 镜像或部署产物。
- 保留上一版管理后台静态资源。
- 小程序如已提交审核但未发布，可撤回或重新上传上一版；如已全量发布，按微信后台能力回退或重新提审上一版。
- 应用回滚后再次执行 `/health` 和核心链路烟测。

数据库恢复：

- 只有当迁移或数据写入造成核心链路不可用，且无法通过前向修复解决时，才执行数据库恢复。
- 恢复前先暂停 API 写入流量，并保留故障库快照。
- 使用发版前备份恢复到受控目标库，流程见 `docs/production-data-runbook.md`。
- 本地或受控环境恢复命令必须带 `--confirm-local-restore`：

```bash
pnpm db:restore -- --env-file /secure/env/prod-restore.env --file /secure/backups/backup.sql --confirm-local-restore
```

- 生产恢复后必须重新执行配置检查、`/health`、管理员登录、课程列表、预约、取消和消课烟测。

禁止在没有可用备份、没有故障库快照、没有负责人确认的情况下执行破坏性数据库回滚。

## 8. 发布后观察

发布后至少观察一个完整约课高峰，重点看：

- API 错误日志和告警。
- 登录失败率。
- 预约成功数、取消数、消课数。
- 满员课程数。
- 通知失败数和重试结果。
- 数据库连接数、慢查询和备份任务状态。

发现异常时记录到发布记录，并决定热修、回滚或延后处理。

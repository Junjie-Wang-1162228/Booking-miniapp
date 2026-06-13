# 生产数据迁移、备份与恢复 Runbook

最后更新：2026-06-13

本文档用于拳馆约课小程序上线、发版和数据恢复。执行生产操作前，先确认当前环境变量指向生产库，且生产库不是本地、测试或 shadow 数据库。

生产数据库账号应按 `docs/production-db-accounts.md` 拆分 API 运行、迁移、备份和恢复账号，避免共用 `root` 或示例账号。

## 生产配置检查

发版前先运行 API 配置自检：

```bash
NODE_ENV=production pnpm --filter @booking/api config:check
```

生产环境必须满足：

- `JWT_SECRET` 使用非默认值。
- `CORS_ORIGINS` 只包含后台管理端可信域名。
- `DATABASE_URL` 指向生产数据库，不能是 localhost、测试库、shadow 库、root/admin/example 用户。
- `WECHAT_AUTO_PROVISION_ENABLED=false`，未知微信账号走绑定码流程。
- 数据库侧 `SHOW GRANTS` 验收通过，API 运行时账号不具备 DDL 或授权权限。

## 发版前迁移步骤

1. 确认代码已通过本地和 CI 验证：`pnpm lint`、`pnpm --filter @booking/api test:e2e`、`pnpm build`、`pnpm security:check`。
2. 备份当前生产库，并记录备份文件路径、时间、Git commit、执行人。
3. 使用迁移专用账号在 staging 或生产同结构临时库上执行 `pnpm --filter @booking/api prisma:migrate` 或部署环境中的 `prisma migrate deploy`。
4. 检查 API 启动、`/health`、管理员登录、课程列表、预约列表和会员详情。
5. 生产发布窗口内执行迁移，完成后立即做烟测。
6. 若迁移后核心链路失败，停止写入流量，按“恢复步骤”回滚数据库到发版前备份。

## 本地备份

备份脚本默认读取 `apps/api/.env` 的 `DATABASE_URL`，输出到 `db-backups/`。该目录已加入 `.gitignore`，不要提交 SQL 备份。

查看将执行的命令，密码会脱敏：

```bash
pnpm db:backup -- --dry-run
```

生成备份：

```bash
pnpm db:backup
```

指定输出文件：

```bash
pnpm db:backup -- --out /secure/backups/boxing-booking-$(date +%F-%H%M%S).sql
```

脚本使用 `mysqldump --single-transaction --routines --triggers --no-tablespaces`，通过 `MYSQL_PWD` 环境变量传递密码，不把密码写进命令参数。

## 恢复步骤

恢复会覆盖目标库中的对象。生产恢复前先暂停 API 写入流量，并保留当前故障库快照，方便事后排查。

先查看恢复命令：

```bash
pnpm db:restore -- --dry-run --file /secure/backups/backup.sql
```

本地或受控环境恢复时必须显式确认：

```bash
pnpm db:restore -- --file /secure/backups/backup.sql --confirm-local-restore
```

恢复到指定临时库可覆盖 `DATABASE_URL` 解析出的库名：

```bash
pnpm db:restore -- --file /secure/backups/backup.sql --database boxing_booking_restore_drill --confirm-local-restore
```

前提是当前数据库账号已经拥有目标库的恢复权限。做恢复演练时，推荐准备只指向临时库的独立 env-file，例如：

```bash
pnpm db:restore -- --env-file /secure/env/restore-drill.env --file /secure/backups/backup.sql --confirm-local-restore
```

生产恢复建议使用平台快照或 DBA 工具；如必须用本脚本，先准备只用于恢复窗口的受控账号，执行后立即回收权限。

## 定期备份策略

首选云数据库或托管 MySQL 的自动备份，要求：

- 每日至少 1 次全量备份。
- 关键发版前手动备份一次。
- 备份保留至少 14 天，具体按 `docs/data-retention-policy.md` 和拳馆实际数据保留政策确认。
- 每月至少做一次恢复演练，恢复到临时库并抽查核心表。
- 备份文件加密存储，访问权限限制给运维负责人。

如果当前环境没有托管备份，可用系统定时任务调用 `pnpm db:backup -- --out <安全目录>`，但上线前仍需补齐监控、失败告警和异地存储。

## 已完成的本地恢复演练

2026-06-13 已完成一次本地演练：

- `pnpm db:backup -- --out /tmp/boxing-booking-restore-drill.sql`
- 创建临时库 `boxing_booking_restore_drill`
- `pnpm db:restore -- --env-file /tmp/boxing-booking-root.env --file /tmp/boxing-booking-restore-drill.sql --confirm-local-restore`
- 抽查表行数：`User=671`、`BoxingClass=3`、`Booking=0`、`AuditLog=0`
- 演练结束后删除临时库

该演练证明当前脚本可以从应用实际连接的 MySQL 导出，并恢复到独立临时库。它不等于生产自动备份已经配置完成。

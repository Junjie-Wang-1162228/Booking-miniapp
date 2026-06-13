# 生产数据库账号最小权限 Runbook

最后更新：2026-06-13

本文档用于配置拳馆约课小程序生产 MySQL 账号。目标是避免 API、迁移、备份和恢复共用 `root` 或示例账号，降低误操作和凭证泄漏后的影响范围。

## 账号分层

| 账号 | 使用场景 | 允许权限 | 禁止事项 |
| --- | --- | --- | --- |
| `booking_app` | API 运行时 `DATABASE_URL` | 对生产业务库的数据读写：`SELECT`、`INSERT`、`UPDATE`、`DELETE` | 不授予 `CREATE`、`ALTER`、`DROP`、`GRANT OPTION`、全局权限 |
| `booking_migrator` | 发版窗口执行 Prisma migration | 只在生产业务库上授予迁移所需 DDL/DML 权限 | 不作为 API 运行时账号；不长期放在应用环境变量里 |
| `booking_backup` | 备份脚本或托管备份代理 | 只读导出所需权限：`SELECT`、`SHOW VIEW`、`TRIGGER`、`EVENT` | 不授予写权限；不用于恢复 |
| `booking_restore` | 受控恢复窗口或临时恢复库演练 | 恢复目标库所需 DDL/DML 权限 | 不长期启用；恢复结束后回收或轮换密码 |

生产 `DATABASE_URL` 应使用 `booking_app` 或等价的运行时低权限账号。当前 `pnpm --filter @booking/api config:check` 已拒绝 `root`、`admin`、`administrator`、`postgres`、`mysql` 和本地示例用户 `booking_user`，但它无法远程证明数据库侧真实 grant；上线前仍必须执行本 runbook 的验收命令。

## 建议 SQL 模板

以下 SQL 需由 DBA 或云数据库管理员在生产 MySQL 上执行。把示例密码替换为部署平台生成的随机强密码，并按实际主机来源收窄 `'%'`。

```sql
CREATE USER 'booking_app'@'%' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE
ON `boxing_booking_prod`.*
TO 'booking_app'@'%';

CREATE USER 'booking_migrator'@'%' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES, LOCK TABLES
ON `boxing_booking_prod`.*
TO 'booking_migrator'@'%';

CREATE USER 'booking_backup'@'%' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT
ON `boxing_booking_prod`.*
TO 'booking_backup'@'%';

CREATE USER 'booking_restore'@'%' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES, LOCK TABLES, TRIGGER, EVENT
ON `boxing_booking_restore_drill`.*
TO 'booking_restore'@'%';
```

如果云数据库不支持某些权限名，按平台能力选择等价的最小权限角色，并记录差异。迁移账号和恢复账号可以是临时账号：只在发版或演练窗口创建，用完立即禁用或轮换密码。

## 应用环境变量

API 运行时只配置低权限账号：

```bash
DATABASE_URL="mysql://booking_app:<password>@db.example.com:3306/boxing_booking_prod"
NODE_ENV=production
```

迁移、备份、恢复分别使用独立 env-file，不放入 API 常驻环境：

```bash
# /secure/env/prod-migration.env
DATABASE_URL="mysql://booking_migrator:<password>@db.example.com:3306/boxing_booking_prod"

# /secure/env/prod-backup.env
DATABASE_URL="mysql://booking_backup:<password>@db.example.com:3306/boxing_booking_prod"

# /secure/env/restore-drill.env
DATABASE_URL="mysql://booking_restore:<password>@db.example.com:3306/boxing_booking_restore_drill"
```

备份脚本可指定 env-file：

```bash
pnpm db:backup -- --env-file /secure/env/prod-backup.env --out /secure/backups/boxing-booking-$(date +%F-%H%M%S).sql
```

恢复演练使用临时库，不直接覆盖生产库：

```bash
pnpm db:restore -- --env-file /secure/env/restore-drill.env --file /secure/backups/backup.sql --confirm-local-restore
```

## 验收命令

发版前执行生产配置自检，确认 API 不会用超级用户或示例账号启动：

```bash
NODE_ENV=production \
JWT_SECRET=production-secret-123 \
CORS_ORIGINS=https://admin.example.com \
DATABASE_URL=mysql://booking_app:prod-pass@db.example.com:3306/boxing_booking_prod \
WECHAT_AUTO_PROVISION_ENABLED=false \
pnpm --filter @booking/api config:check
```

在数据库侧查看每个账号实际权限：

```sql
SHOW GRANTS FOR 'booking_app'@'%';
SHOW GRANTS FOR 'booking_migrator'@'%';
SHOW GRANTS FOR 'booking_backup'@'%';
SHOW GRANTS FOR 'booking_restore'@'%';
```

验收标准：

- `booking_app` 没有 `CREATE`、`ALTER`、`DROP`、`GRANT OPTION` 或全局权限。
- `booking_backup` 没有 `INSERT`、`UPDATE`、`DELETE`、`CREATE`、`ALTER`、`DROP`。
- `booking_migrator` 和 `booking_restore` 只对指定业务库或临时恢复库授权。
- 生产 API 的 `DATABASE_URL` 使用 `booking_app`，不是迁移、备份、恢复或超级用户账号。
- 所有数据库密码只存放在部署 secret store 或受控 env-file，不能提交 Git。

## 轮换与离职处理

- 发版临时账号和恢复账号用完立即禁用或轮换密码。
- 备份账号至少每 90 天轮换一次，或按云平台策略自动轮换。
- 任何运维人员离职、外包交接或疑似泄漏时，立即轮换所有数据库账号密码。
- 轮换后重新运行 `config:check`、备份 dry-run 和一次受控恢复演练。

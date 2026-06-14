# 拳馆约课小程序

这是一个面向拳馆/健身工作室的约课小程序项目，包含：

- 后端 API：NestJS + Prisma + MySQL
- 管理后台：React + Vite + Ant Design
- 微信小程序：Taro
- 自动化检查：API E2E、前端构建、敏感信息检查、发布/运维清单检查

当前状态：本地试运营能力约 85% 完成；正式商用上线约 65%-70% 完成。代码主链路已具备约课、取消、消课、多门店权限、会员绑定、通知、审计、备份、限流、错误脱敏、告警和运营指标。正式上线仍需要拳馆主体 AppID、备案、生产域名、微信后台隐私保护指引、真实 staging/production 环境、生产数据库权限和真机验收。

## 功能范围

用户端小程序：

- 微信登录，未知微信账号进入绑定码流程。
- 会员按所属门店查看课程。
- 课程列表支持日期分组、日期筛选、剩余名额、已预约和满员状态。
- 课程详情展示训练内容、适合人群、装备要求、取消规则、门店地址、电话和教练信息。
- 预约成功后可直接查看“预约”页。
- 开课前可按规则取消预约。
- 账户页展示会员资料、当前门店、剩余课时、最近消课记录、隐私政策和约课规则。
- 请求层有 10 秒超时，弱网/超时/网络失败会显示中文提示并提供重试入口。

管理后台：

- 管理员、店长、教练按门店权限访问数据。
- 创建、编辑、取消课程。
- 管理会员资料、手机号、会员号、课时余额、微信绑定/解绑/重绑。
- 今日课程视图按课程分组展示预约名单。
- 对有效预约执行消课，防止重复消课和越权消课。
- 手动取消会员预约，释放名额且不扣课时。
- 导出预约名单 CSV。
- 查看通知任务、失败原因并手动重试。
- 查看每日预约、取消、消课、满员课程指标。
- 查看关键操作审计日志。

后端能力：

- JWT 鉴权和角色校验。
- 多门店数据隔离。
- 预约容量事务锁，避免并发超卖。
- 取消截止规则。
- 微信订阅消息任务：预约确认、开课提醒、课程取消、课程改期。
- 生产配置自检，拒绝默认密钥、本地/测试库、超级用户数据库账号、生产宽松自动开户。
- 登录和预约限流。
- 客户端错误响应和告警 payload 脱敏。
- 数据库备份/恢复脚本和恢复演练文档。

## 目录结构

```text
apps/api       后端 API
apps/admin     管理后台
apps/miniapp   微信小程序源码
docs           商用清单、发布清单、运维手册、数据策略
scripts        项目级静态检查和运维测试脚本
```

`apps/miniapp/dist`、`apps/admin/dist`、`.env`、截图、日志、数据库备份等都是本地产物，不提交到 GitHub。

## 本地启动

1. 安装依赖：

```bash
pnpm install
```

2. 复制环境变量模板：

```bash
cp .env.example apps/api/.env
```

3. 启动 MySQL：

```bash
pnpm dev:db
```

如果 `localhost:3307` 已被其他本地项目占用，不要直接停掉不确定归属的容器。可以临时改用本项目独立端口：

```bash
BOOKING_MYSQL_HOST_PORT=3308 pnpm dev:db
```

然后把本地 `apps/api/.env` 里的 `DATABASE_URL` 和 `SHADOW_DATABASE_URL` 端口同步改成 `3308`，再运行 `pnpm dev:status:strict` 确认端口和 API 环境一致。长期使用 3308 时，可把 `BOOKING_MYSQL_HOST_PORT=3308` 放在仓库根目录本地 `.env` 或 shell 环境变量中；这些本地文件不要提交。

4. 执行迁移和种子数据：

```bash
pnpm --filter @booking/api prisma:deploy
pnpm --filter @booking/api prisma:seed
```

`prisma:deploy` 只应用仓库中已经存在的 migration，适合本地初始化、换端口后重建数据库和 CI/部署环境。需要开发新的数据库结构变更时，再使用交互式的 `pnpm --filter @booking/api prisma:migrate` 创建新 migration。

5. 启动后端：

```bash
pnpm api:dev
```

API 默认地址：`http://localhost:4000`

6. 启动管理后台：

```bash
pnpm admin:dev
```

管理后台默认地址：`http://localhost:5173`，端口占用时 Vite 会自动切到下一个端口。

7. 启动小程序构建：

```bash
pnpm miniapp:dev
```

然后在微信开发者工具打开 `apps/miniapp/dist`。

也可以用后台预览脚本一次性补齐缺失的 API、管理端和小程序 watch：

```bash
pnpm dev:preview:start
pnpm dev:preview:status
pnpm dev:preview:stop
```

`dev:preview:start` 不会重复启动已经运行的预览服务；日志和 PID 写入本地 `.dev/preview`，该目录已忽略，不提交 GitHub。

## 本地账号

管理后台：

```text
账号：admin
密码：admin123456

账号：east-manager
密码：manager123456
```

小程序本地调试会员：

```text
member-a：阿杰 / 城东店 / 10 节课
member-b：小林 / 城西店 / 6 节课
member-c：东店同学 / 城东店 / 4 节课
```

正式或接近正式的微信登录调试，应使用 `pnpm miniapp:dev`，并在 `apps/api/.env` 中配置自己的 `MINIAPP_APP_ID` 和 `MINIAPP_APP_SECRET`。这些真实值只能保存在本地 `.env`、部署平台 secret store 或微信开发者工具本地私有配置中，不能提交 GitHub。

本地假会员调试可使用：

```bash
pnpm miniapp:dev:local
```

## 敏感信息和脱敏规则

不要提交以下内容：

- 真实小程序 AppID、AppSecret、订阅消息模板 ID。
- `.env`、`.env.local`、`.env.production` 等真实环境变量文件。
- 数据库密码、JWT secret、告警 webhook token。
- 证书、私钥、p12/pfx 文件。
- 本地截图、Playwright/DevTools 日志、数据库备份 SQL。

当前仓库会通过 `pnpm security:check` 检查：

- 禁止跟踪 `.env*` 真实配置文件。
- 禁止跟踪微信开发者工具本地私有配置 `project.private.config.json`。
- 禁止跟踪私钥和证书文件。
- 禁止在日志调用中直接输出手机号、openid、JWT/token、AppSecret、密码等敏感字段。
- 禁止在已追踪文档、源码、配置、脚本和暂存区内容中提交真实 `wx...` AppID；`apps/miniapp/project.config.json` 使用 `touristappid` 占位。

如果需要配置真实 AppID，请放在本地微信开发者工具私有配置或本地环境变量中。
微信开发者工具生成的 `apps/miniapp/project.private.config.json` 和 `apps/miniapp/dist/**` 只保留在本地；仓库内 `.env.example` 和 `apps/miniapp/project.config.json` 仅使用 `touristappid` 占位。

## 常用命令

```bash
pnpm dev:db
pnpm dev:status
pnpm dev:status:strict
pnpm dev:preview:start
pnpm dev:preview:status
pnpm dev:preview:stop
pnpm api:dev
pnpm admin:dev
pnpm miniapp:dev
pnpm miniapp:dev:local
```

`pnpm dev:status` 会同时显示 `DATABASE_URL` 的非敏感连接目标和发布该本地端口的 Docker 容器；如果 compose MySQL 健康但 API 实际连接到另一个容器，它会在 `notes` 中提示并给出处理建议，便于排查本地数据库漂移。它也会检测本项目残留的孤儿 Prisma query-engine 进程，只提示 PID 和人工处理建议，不会自动结束进程。输出中的 `progress` 会汇总本地预览完成度、视觉截图矩阵完成度、人工验收 checklist 完成度、下一步动作、截图保存路径，以及手动切到目标模拟器后应运行的 `MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next`。同一命令也会在 `visualQa.captureCommand` 输出结构化截图命令，方便复制或被后续脚本读取。

`pnpm dev:status:strict` 使用同一套检查，但会把数据库端口漂移和孤儿 Prisma query-engine 视为失败。适合在继续手工验收、截图补齐或发布前确认本地环境是否足够标准；普通 `pnpm dev:status` 仍用于快速确认预览服务是否能打开。

自动化检查：

```bash
pnpm verify
```

`pnpm verify` 是提交或 push 前的统一质量门禁，会串行运行 Prisma Client 生成、lint、API E2E、项目脚本测试、敏感信息/依赖安全检查和三端构建，不打开微信开发者工具，也不执行需要人工补图的视觉截图矩阵。

单独运行各项检查：

```bash
pnpm lint
pnpm --filter @booking/api test:e2e
node --test scripts/*.test.mjs
pnpm security:check
pnpm build
```

`pnpm --filter @booking/api test:e2e` 会自动准备并迁移本地独立测试库 `boxing_booking_e2e`，然后只重置该 E2E 库的数据，不清空本地预览库 `boxing_booking`。未显式设置 `E2E_DATABASE_URL` 时，默认会读取 `apps/api/.env` 的 `DATABASE_URL` 并只把库名替换为 `boxing_booking_e2e`；例如本地开发库是 `localhost:3308/boxing_booking` 时，E2E 库会自动变成 `localhost:3308/boxing_booking_e2e`。测试启动时会拒绝非白名单测试库，避免误清远程、生产或本地开发数据。受控 CI 如已自行创建临时库，可设置 `E2E_DATABASE_URL` 指向该库，并在需要时设置 `E2E_SKIP_DATABASE_CREATE=true`；只有确认目标是隔离临时库时才使用 `E2E_ALLOW_DATABASE_RESET=true`。

当前仓库已接入 GitHub Actions：`.github/workflows/verify.yml` 会在 push 到 `main`、PR 和手动触发时启动 MySQL 8.4 service，并运行同一条 `pnpm verify` 门禁。

单项检查：

```bash
pnpm dev:status:test
pnpm dev:status:strict
pnpm miniapp:network-errors:test
pnpm ops:alerting:test
pnpm ops:staging:test
pnpm ops:release-checklist:test
pnpm ops:manual-test:status
pnpm ops:manual-test:readiness
pnpm ops:third-party-notices:test
```

`pnpm ops:manual-test:status` 会读取 `docs/manual-test-checklist.md` 的勾选状态，输出 `manual-test-status` JSON，包括总项数、完成数、分组进度和下一条未完成项；它不打开微信开发者工具，也不会因为清单未完成而返回失败。

`pnpm ops:manual-test:readiness` 会执行严格本地状态检查并输出 `manual-test-readiness` JSON，把本地预览、strict 环境门禁、视觉截图矩阵和手工验收清单汇总到一起。它不打开微信开发者工具；只有本地预览和 strict 门禁通过时才表示可以开始真实微信人工验收，视觉截图和完整 checklist 仍作为发布前剩余项继续展示。

微信登录配置检查：

```bash
pnpm --filter @booking/api wechat:check
```

生产配置自检示例，示例值必须替换为部署平台 secret：

```bash
NODE_ENV=production \
JWT_SECRET=<production-jwt-secret> \
CORS_ORIGINS=https://admin.example.com \
DATABASE_URL=mysql://booking_app:<password>@db.example.com:3306/boxing_booking_prod \
WECHAT_AUTO_PROVISION_ENABLED=false \
pnpm --filter @booking/api config:check
```

数据库备份和恢复：

```bash
pnpm db:backup -- --dry-run
pnpm db:backup
pnpm db:restore -- --dry-run --file /secure/backups/backup.sql
pnpm db:restore -- --file /secure/backups/backup.sql --confirm-local-restore
```

小程序视觉检查：

```bash
pnpm miniapp:visual-qa
pnpm miniapp:visual-qa:next
pnpm miniapp:visual-qa:check
```

`pnpm miniapp:visual-qa` 只输出状态，不打开微信开发者工具；输出中的 `progress` 表示截图完成度，`next.missingScreenshots` 会列出下一台设备缺失页面和截图保存路径。普通 `pnpm miniapp:visual-qa:capture` 会先拒绝执行，避免误打开微信开发者工具。需要截图时，先在微信开发者工具里手动切到目标模拟器设备，再显式确认运行：

```bash
MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next
```

`capture-next` 会校验当前模拟器设备必须等于下一台缺失设备，避免还停在其他设备时误采截图。

`pnpm miniapp:visual-qa:check` 会检查截图矩阵、PNG 有效性和基础尺寸匹配。截图属于本地手工验收产物，不提交 GitHub。

## 发布和商用状态

已经具备的代码侧能力：

- 核心约课链路自动化覆盖。
- 多门店权限和店长越权拦截。
- 生产安全配置自检。
- 敏感日志守卫。
- 错误响应和告警脱敏。
- 发布清单、staging 手册、生产数据库账号手册、数据保留策略、第三方依赖许可证说明。

正式上线前仍需完成：

- 使用拳馆自己的小程序主体，不使用个人开发 AppID 正式运营。
- 完成微信认证、备案、服务类目、隐私保护指引、request 合法域名。
- 配置生产 HTTPS API 域名和管理后台域名。
- 配置真实生产 AppSecret、订阅消息模板、告警 webhook 和接收人。
- 创建真实 staging 和 production 环境，并保持数据库、域名、secret、告警路由隔离。
- 生产数据库账号执行最小权限授权并验收 `SHOW GRANTS`。
- 配置生产数据库自动备份、保留周期和备份失败告警。
- 完成 iOS 微信、Android 微信、微信开发者工具、多设备截图、弱网和真实微信账号端到端验收。

建议只在上述事项完成后再对真实会员开放。

## 关键文档

- `docs/optimization-checklist.md`：当前优化目标和完成记录。
- `docs/commercial-readiness-checklist.md`：商用上线 Go / No-Go 清单。
- `docs/manual-test-checklist.md`：手工测试清单。
- `docs/miniapp-visual-qa.md`：小程序视觉验收矩阵。
- `docs/release-checklist.md`：发布检查清单。
- `docs/staging-runbook.md`：staging 环境隔离和验收手册。
- `docs/production-data-runbook.md`：生产数据迁移、备份、恢复流程。
- `docs/production-db-accounts.md`：生产数据库最小权限账号配置。
- `docs/data-retention-policy.md`：数据保留、删除和纠错策略。
- `THIRD_PARTY_NOTICES.md`：主要依赖和许可证说明。

## dist 和 apps 的区别

- `apps/miniapp/src`、`apps/admin/src`、`apps/api/src` 是源码，应该提交。
- `apps/miniapp/dist` 是 Taro 构建出来给微信开发者工具打开的产物，不提交。
- `apps/admin/dist` 是管理后台生产构建产物，不提交。
- 修改功能时改 `apps/*/src`，不要直接改 `dist`。

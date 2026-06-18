# 拳馆约课小程序

这是一个面向拳馆/健身工作室的约课小程序项目，包含：

- 后端 API：NestJS + Prisma + MySQL
- 管理后台：React + Vite + Ant Design
- 微信小程序：Taro
- 自动化检查：API E2E、前端构建、敏感信息检查、发布/运维清单检查

当前状态：本地试运营能力约 85% 完成；正式商用上线约 65%-70% 完成。代码主链路已具备约课、取消、消课、多门店权限、会员绑定、通知、审计、备份、限流、错误脱敏、告警和运营指标。正式上线仍需要拳馆主体 AppID、备案、生产域名、微信后台隐私保护指引、真实 staging/production 环境、生产数据库权限和真机验收。

## 功能范围

用户端小程序：

- 账户页保留微信授权登录和账号登录；当前 MVP 的账号登录只用于运营测试账号。
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

小程序运营端：

- 管理员或测试店长可在小程序账户页使用账号登录进入运营管理。
- 当前最小 MVP 默认只准备 `admin/admin` 和 `test/test` 两个运营测试账号。
- 会员仍走微信授权登录和绑定码流程，不使用账号密码登录。

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

前置环境：

- Node.js 24。
- pnpm 9.15.9，推荐通过 Corepack 启用：`corepack enable && corepack prepare pnpm@9.15.9 --activate`。
- Docker Desktop，用于本地 MySQL。

依赖全部由仓库 `package.json` / `pnpm-lock.yaml` 管理；不要让协作者全局安装 Taro、Vite、Nest CLI 或其他项目 CLI。`pnpm install` 后，`pnpm` 会自动使用 workspace 里的本地依赖。脚本中的临时环境变量统一通过 `cross-env` 处理，兼容 macOS、Linux 和 Windows。

1. 安装依赖：

```bash
pnpm install
```

2. 复制环境变量模板：

```bash
cp .env.example apps/api/.env
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example apps/api/.env
```

3. 启动 MySQL：

```bash
pnpm dev:db
```

如果 `localhost:3307` 已被其他本地项目占用，不要直接停掉不确定归属的容器。可以临时改用本项目独立端口：

```bash
cross-env BOOKING_MYSQL_HOST_PORT=3308 pnpm dev:db
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

小程序运营端账号登录：

```text
账号：admin
密码：admin

账号：test
密码：test
```

如果本地数据库还没有这两个临时账号，先执行：

```bash
pnpm --filter @booking/api seed:cloud-test-accounts
```

这两个弱密码账号只用于真机调试和协作者验收；正式上线前必须删除、禁用或改成强密码。会员仍走微信授权登录和绑定码流程。

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

正式或接近正式的微信登录调试，应使用 `pnpm miniapp:dev`，并在 `apps/api/.env` 中配置自己的 `MINIAPP_APP_ID` 和 `MINIAPP_APP_SECRET`。配置完成后运行 `pnpm miniapp:sync-private-config`，把真实 AppID 同步到本地 ignored 的微信开发者工具私有配置；命令只输出脱敏状态，不输出真实 AppID。这些真实值只能保存在本地 `.env`、部署平台 secret store 或微信开发者工具本地私有配置中，不能提交 GitHub。

真机调试前推荐运行：

```bash
pnpm miniapp:prepare-device
```

该命令会自动选择本机局域网 IPv4，先同步本地私有 AppID，再用 `TARO_APP_API_BASE_URL=http://<LAN-IP>:4000` 重建小程序 `dist`，最后运行 `pnpm ops:manual-test:readiness`。它不会打开微信开发者工具；完成后手动打开 `apps/miniapp/dist` 做真机调试。如果自动识别的地址不对，可显式指定：

```bash
pnpm miniapp:prepare-device --api-base-url http://<你的局域网IP>:4000
```

本地假会员调试可使用：

```bash
pnpm miniapp:dev:local
```

## 部署指南

本项目没有绑定具体云厂商。协作者或自动化 agent 部署时，把它拆成四个对象处理：MySQL 数据库、API Node 服务、管理后台静态站点、微信小程序构建包。所有真实 secret 只放在部署平台的 secret store 或受控 env-file，不写入 Git。

### 部署前准备

推荐运行环境：

- Node.js 24。
- pnpm 9.15.9，和仓库 `packageManager` 保持一致。
- MySQL 8.x，生产推荐托管 MySQL 或云数据库。
- 一个 API HTTPS 域名，例如 `https://api.example.com`。
- 一个管理后台 HTTPS 域名，例如 `https://admin.example.com`。
- 拳馆自己的微信小程序 AppID、AppSecret、订阅消息模板 ID。
- 微信后台已配置 request 合法域名、隐私保护指引、服务类目和体验成员。

部署账号分层：

- API 运行账号：只用于 `DATABASE_URL`，使用低权限 MySQL 账号，例如 `booking_app`。
- 迁移账号：只在发布窗口执行 Prisma migration，例如 `booking_migrator`。
- 备份账号：只读导出，例如 `booking_backup`。
- 恢复账号：只在受控恢复窗口或恢复演练使用，例如 `booking_restore`。

账号权限模板见 `docs/production-db-accounts.md`。不要让 API 常驻环境使用 root、管理员账号、迁移账号、备份账号或恢复账号。

### 环境变量清单

API 运行时必须配置：

```bash
NODE_ENV=production
API_PORT=4000
JWT_SECRET=<random-long-production-secret>
CORS_ORIGINS=https://admin.example.com
DATABASE_URL=mysql://booking_app:<password>@db.example.com:3306/boxing_booking_prod
MINIAPP_APP_ID=<wx-app-id>
MINIAPP_APP_SECRET=<wx-app-secret>
WECHAT_AUTO_PROVISION_ENABLED=false
WECHAT_NOTIFICATION_WORKER_ENABLED=true
BOOKING_CANCEL_CUTOFF_MINUTES=120
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_LOGIN_MAX=200
RATE_LIMIT_BOOKING_MAX=120
BUSINESS_TIMEZONE_OFFSET_MINUTES=480
```

按需配置通知和告警：

```bash
WECHAT_BOOKING_CREATED_TEMPLATE_ID=<booking-created-template-id>
WECHAT_SUBSCRIBE_TEMPLATE_ID=<class-reminder-template-id>
WECHAT_CLASS_CANCELED_TEMPLATE_ID=<class-canceled-template-id>
WECHAT_CLASS_RESCHEDULED_TEMPLATE_ID=<class-rescheduled-template-id>
WECHAT_SUBSCRIBE_PAGE=pages/bookings/index
WECHAT_SUBSCRIBE_MINIPROGRAM_STATE=formal
WECHAT_SUBSCRIBE_CLASS_TITLE_FIELD=thing1
WECHAT_SUBSCRIBE_CLASS_TIME_FIELD=time2
WECHAT_SUBSCRIBE_BRANCH_FIELD=thing3
ALERT_WEBHOOK_URL=<alert-webhook-url>
ALERT_WEBHOOK_TOKEN=<alert-webhook-token>
```

管理后台构建时配置：

```bash
VITE_API_BASE_URL=https://api.example.com
```

小程序构建时配置：

```bash
TARO_APP_AUTH_MODE=wechat
TARO_APP_API_BASE_URL=https://api.example.com
TARO_APP_CLOUDBASE_ENV_ID=<cloudbase-env-id>
TARO_APP_CLOUDBASE_SERVICE_NAME=booking-api
TARO_APP_WECHAT_BOOKING_CREATED_TEMPLATE_ID=<booking-created-template-id>
TARO_APP_WECHAT_SUBSCRIBE_TEMPLATE_ID=<class-reminder-template-id>
TARO_APP_BUSINESS_TIMEZONE_OFFSET_MINUTES=480
```

`TARO_APP_API_BASE_URL` 用于普通 HTTPS API 或本地局域网调试。部署到微信云托管并发布体验版时，优先使用 `TARO_APP_CLOUDBASE_ENV_ID` + `TARO_APP_CLOUDBASE_SERVICE_NAME`，小程序会通过 `Taro.cloud.callContainer` 调用云托管服务，避免把 CloudBase 默认 `run.tcloudbase.com` 域名填入正式 `request 合法域名`。

`BUSINESS_TIMEZONE_OFFSET_MINUTES` 和 `TARO_APP_BUSINESS_TIMEZONE_OFFSET_MINUTES` 必须保持一致。默认 `480` 表示东八区；如果拳馆实际营业时区不是东八区，两边一起改，避免运营端“今日课程/预约名单/消课”错日。

staging 环境使用独立域名、数据库和 secret，例如 `https://staging-api.example.com`、`https://staging-admin.example.com`、`boxing_booking_staging`。staging 详细约束见 `docs/staging-runbook.md`。

如果当前只做微信真机调试，可以暂时不部署网站后台，先按 `docs/cloudbase-miniapp-runbook.md` 把 API 部署到 CloudBase Run，再用小程序内运营端管理课程和预约。

### 一键部署命令模板

下面模板适合 CI/CD、服务器脚本或其他 agent 复制执行。把尖括号占位值替换成部署平台 secret；不要把替换后的命令写回 README。

```bash
set -euo pipefail

corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile

# 1. 本地或 CI 质量门禁。该命令不打开微信开发者工具。
pnpm verify

# 2. 生产配置自检。必须使用 API 运行时的低权限 DATABASE_URL。
NODE_ENV=production \
JWT_SECRET="<random-long-production-secret>" \
CORS_ORIGINS="https://admin.example.com" \
DATABASE_URL="mysql://booking_app:<password>@db.example.com:3306/boxing_booking_prod" \
WECHAT_AUTO_PROVISION_ENABLED=false \
pnpm --filter @booking/api config:check

# 3. 发版前备份。备份 env-file 应只包含备份账号 DATABASE_URL。
pnpm db:backup -- --dry-run --env-file /secure/env/prod-backup.env
pnpm db:backup -- --env-file /secure/env/prod-backup.env --out "/secure/backups/boxing-booking-$(date +%F-%H%M%S).sql"

# 4. 数据库迁移。迁移 env-file 应只包含迁移账号 DATABASE_URL。
set -a
. /secure/env/prod-migration.env
set +a
pnpm --filter @booking/api prisma:deploy

# 5. 三端构建。admin 的 API 地址、miniapp 的云托管服务信息在构建时注入。
cross-env VITE_API_BASE_URL="https://api.example.com" pnpm --filter @booking/admin build
cross-env TARO_APP_AUTH_MODE=wechat TARO_APP_CLOUDBASE_ENV_ID="<cloudbase-env-id>" TARO_APP_CLOUDBASE_SERVICE_NAME="booking-api" TARO_APP_WECHAT_BOOKING_CREATED_TEMPLATE_ID="<booking-created-template-id>" TARO_APP_WECHAT_SUBSCRIBE_TEMPLATE_ID="<class-reminder-template-id>" TARO_APP_BUSINESS_TIMEZONE_OFFSET_MINUTES=480 pnpm --filter @booking/miniapp build:weapp
pnpm --filter @booking/api build
```

如果小程序不走微信云托管 `callContainer`，则把 `TARO_APP_API_BASE_URL` 换成 staging/production API 域名，并在微信后台配置对应的正式 `request 合法域名`。

### API 服务部署

API 构建产物入口：

```bash
node apps/api/dist/src/main.js
```

API 进程启动前必须已经注入生产 API 环境变量。常见部署方式：

- Docker / Kubernetes：镜像启动命令使用 `node apps/api/dist/src/main.js`，secret 通过平台注入。
- PM2 / systemd：工作目录为仓库根目录，启动命令同上，env-file 存放在服务器受控目录。
- PaaS：构建命令使用 `pnpm install --frozen-lockfile && pnpm --filter @booking/api build`，启动命令使用 `node apps/api/dist/src/main.js`。

API 发布后立即烟测：

```bash
curl -fsS https://api.example.com/health
```

期望返回：

```json
{ "ok": true }
```

### 管理后台部署

管理后台是静态资源应用。构建：

```bash
VITE_API_BASE_URL=https://api.example.com pnpm --filter @booking/admin build
```

部署目录：

```text
apps/admin/dist
```

把该目录发布到 Nginx、对象存储静态站点、Vercel、Netlify 或其他静态托管服务。所有前端路由都应回退到 `index.html`。管理后台域名必须加入 API 的 `CORS_ORIGINS`，否则浏览器会被 CORS 拦截。

### 小程序部署

构建：

```bash
cross-env TARO_APP_AUTH_MODE=wechat TARO_APP_CLOUDBASE_ENV_ID=<cloudbase-env-id> TARO_APP_CLOUDBASE_SERVICE_NAME=booking-api TARO_APP_WECHAT_BOOKING_CREATED_TEMPLATE_ID=<booking-created-template-id> TARO_APP_WECHAT_SUBSCRIBE_TEMPLATE_ID=<class-reminder-template-id> TARO_APP_BUSINESS_TIMEZONE_OFFSET_MINUTES=480 pnpm --filter @booking/miniapp build:weapp
```

微信开发者工具打开目录：

```text
apps/miniapp/dist
```

上传前确认：

- `apps/miniapp/project.config.json` 仍只提交 `touristappid` 占位。
- 真实 AppID 放在微信开发者工具本地私有配置或部署环境中；本地可运行 `pnpm miniapp:sync-private-config` 从 `apps/api/.env` 同步到 `project.private.config.json`。
- 本地真机调试可运行 `pnpm miniapp:prepare-device` 自动重建指向局域网 API 的 `dist` 并检查 readiness。
- 走自有 HTTPS API 时，微信后台 request 合法域名包含 API HTTPS 域名；走微信云托管 `callContainer` 时，不填写 CloudBase 默认 `run.tcloudbase.com` 域名。
- 体验版使用真实微信登录，不使用 `pnpm miniapp:dev:local` 的本地假会员模式。
- 提交审核前完成 `docs/manual-test-checklist.md` 和 `docs/miniapp-visual-qa.md` 的人工验收。

### 部署后烟测

每次 staging 或 production 发布后至少执行：

```bash
curl -fsS https://api.example.com/health
pnpm ops:release-checklist:test
pnpm ops:staging:test
```

人工烟测范围：

- 管理后台能登录。
- 店长账号只能看到自己门店。
- 小程序能微信登录。
- 未绑定微信进入绑定码流程。
- 管理员能创建会员并绑定微信。
- 会员只能看到所属门店课程。
- 会员能预约有余位课程。
- 会员能在截止时间前取消预约。
- 后台能查看今日课程、执行消课、手动取消预约。
- 通知任务和审计日志能记录关键操作。

生产发布、回滚和观察窗口按 `docs/release-checklist.md` 执行；数据库备份、恢复和恢复演练按 `docs/production-data-runbook.md` 执行。

### Agent 部署规则

其他 agent 处理部署时必须遵守：

- 先运行 `git status --short --branch --ignored`，确认没有要误提交的本地 secret、dist、截图或备份。
- 不读取、不打印、不提交真实 AppID、AppSecret、JWT secret、数据库密码或告警 token。
- 修改部署命令前先运行 `pnpm verify` 或说明无法运行的原因。
- 使用 `pnpm --filter @booking/api config:check` 验证生产 API 环境变量。
- 不在自动化里运行会打开微信开发者工具的 `miniapp:visual-qa:capture` 或 `capture-next`。
- 不对生产库运行 `prisma:seed`。
- 不用 root 或示例账号作为生产 `DATABASE_URL`。
- 发布前备份，发布后烟测，失败时按 release checklist 回滚。

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
- 禁止在日志调用中直接输出手机号、openid、JWT/token、AppID、AppSecret、密码等敏感字段。
- 禁止在已追踪文档、源码、配置、脚本和暂存区内容中提交真实 `wx...` AppID；`apps/miniapp/project.config.json` 使用 `touristappid` 占位。

如果需要配置真实 AppID，请放在本地微信开发者工具私有配置或本地环境变量中。配置好 `apps/api/.env` 的 `MINIAPP_APP_ID` 后，可运行 `pnpm miniapp:sync-private-config` 自动写入 ignored 的 `apps/miniapp/project.private.config.json`；命令输出不输出真实 AppID。
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
pnpm miniapp:sync-private-config
pnpm miniapp:prepare-device
pnpm miniapp:dev
pnpm miniapp:dev:local
```

`pnpm dev:status` 会同时显示 `DATABASE_URL` 的非敏感连接目标和发布该本地端口的 Docker 容器；如果 compose MySQL 健康但 API 实际连接到另一个容器，它会在 `notes` 中提示并给出处理建议，便于排查本地数据库漂移。它也会检测本项目残留的孤儿 Prisma query-engine 进程，只提示 PID 和人工处理建议，不会自动结束进程。输出中的 `progress` 会汇总本地预览完成度、视觉截图矩阵完成度、人工验收 checklist 完成度、下一步动作、截图保存路径，以及手动切到目标模拟器后应运行的 `cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next`。同一命令也会在 `visualQa.captureCommand` 输出结构化截图命令，方便复制或被后续脚本读取。

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

如果只想复现某个后端 E2E 用例，可以继续复用同一个安全入口并把 Jest 参数放在 `--` 后面，例如：`pnpm --filter @booking/api test:e2e -- --runTestsByPath test/app.e2e-spec.ts -t "rejects member cancellation inside the cutoff window"`。

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
pnpm ops:manual-test:next
pnpm ops:manual-test:handoff
pnpm ops:manual-test:readiness
pnpm ops:third-party-notices:test
```

`pnpm ops:manual-test:status` 会读取 `docs/manual-test-checklist.md` 的勾选状态，输出 `manual-test-status` JSON，包括总项数、完成数、分组进度、全局下一条未完成项，以及每个分组自己的 `next`；它不打开微信开发者工具，也不会因为清单未完成而返回失败。

`pnpm ops:manual-test:next` 会复用 readiness 检查并输出更短的 `manual-test-next` JSON，只保留下一条人工动作、微信开发者工具应打开的 `apps/miniapp/dist` 路径、构建包 API 是否为真机可访问、视觉截图和手工清单进度、`manualTestSections` 分组进度、过期/无效截图诊断、发布阻断项，以及下一条截图命令。它不打开微信开发者工具，也不输出真实 AppID、AppSecret、token 或账号密码；如果分组下一步原文包含测试账号密码，输出会隐藏密码并保留原清单行号。

`pnpm ops:manual-test:handoff` 会把 `manual-test-next` 的安全状态渲染成中文 Markdown《小程序真机验收交接》，适合发给协作者继续真机测试；它展示当前是否可以开始真机微信验收、是否可发布、DevTools 打开目录、手工验收分组、视觉截图诊断、`visualQaNext` 下一台设备和截图保存路径、下一条截图命令、可复制命令和发布阻断项，不打开微信开发者工具，也不输出真实 AppID、AppSecret、token 或账号密码。

`pnpm ops:manual-test:readiness` 会执行严格本地状态检查并输出 `manual-test-readiness` JSON，把本地预览、strict 环境门禁、本地验收测试数据、真实微信登录配置、小程序 DevTools 项目配置、视觉截图矩阵和手工验收清单汇总到一起。它不打开微信开发者工具；只有本地预览、strict 门禁、本地验收测试数据、本地微信登录配置和小程序 DevTools 项目配置都通过时才表示可以开始真实微信人工验收，视觉截图和完整 checklist 仍作为发布前剩余项继续展示。输出里的 `testData` 会通过 API 只读验证小程序运营端 `admin/admin`、`test/test`、`test` 只管理 1 个门店、两个运营账号都能读取小程序运营页依赖的 metrics/classes/bookings/members 接口、默认后台或运营 token、`east-manager` 店长账号、城东/城西门店、未来课程和店长只能访问城东店的门店权限，不重跑 seed、不重置数据库，也不输出登录 token 或账号密码。输出里的 `wechatConfig` 只包含 AppID 是否已配置、是否仍为占位、AppSecret 是否已配置、mock 登录和自动开户开关等布尔状态，不输出真实 AppID 或 Secret。输出里的 `miniappProject` 只包含 `project.config.json` 是否指向 `dist/`、tracked AppID 是否仍为占位、本地 `project.private.config.json` 是否存在及其 AppID 是否已配置、`dist` 必需文件是否齐全、`dist` API 地址是否为真机可访问类型，以及构建包 API 的 `/health` 是否可访问等布尔/分类状态；如果本地 `project.private.config.json` 没有真实 AppID、构建包仍指向 `localhost`、`127.0.0.1`、`0.0.0.0` 或 `::1`，或构建包 API 的 `/health` 请求失败，会阻断真实微信人工验收，但不会输出真实 AppID 或具体 API URL。输出里的 `manualTestSections` 会列出每个手测分组的完成数、总数、百分比和下一条未完成项，账号密码会隐藏；`visualQaDiagnostics` 会列出已有截图数、无效截图数和去重后的无效原因，便于识别旧图过期。`nextHumanAction` 会在本地门禁已通过时跳过重复的本地启动步骤，直接提示真实微信登录准备分组里的具体下一条任务和行号；`readyForRelease` 只会在所有 readiness 门禁、视觉截图矩阵和完整手工 checklist 都通过时为 `true`，未满足时会在 `releaseBlockers` 中列出发布阻断项。

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
cross-env MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture-next
```

`capture-next` 会校验当前模拟器设备必须等于下一台缺失设备，避免还停在其他设备时误采截图。

`pnpm miniapp:visual-qa:check` 会检查截图矩阵、PNG 有效性、基础尺寸匹配，以及截图是否早于最新小程序 UI 源码变更。截图属于本地手工验收产物，不提交 GitHub。

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
- 完成微信认证、备案、服务类目、隐私保护指引；如果使用自有 HTTPS API，再配置 request 合法域名。
- 配置生产 HTTPS API 域名和管理后台域名；如果小程序走云托管 `callContainer`，生产小程序侧可先不绑定自有 API 域名。
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

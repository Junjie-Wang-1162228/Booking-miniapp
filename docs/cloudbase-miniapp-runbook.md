# 微信云小程序真机调试运行手册

本文档用于当前阶段：网站后台可以暂时不部署，只把后端 API 部署到微信云托管 CloudBase Run，并用微信开发者工具生成小程序真机预览二维码。

## 目标架构

- 后端 API：部署到 CloudBase Run，运行本仓库根目录 `Dockerfile`。
- 数据库：使用云端 MySQL，`DATABASE_URL` 指向该数据库。
- 小程序：构建 `apps/miniapp/dist`，通过微信云开发 `callContainer` 调用云托管服务，用微信开发者工具预览/上传。
- 网站后台：暂时不部署；运营管理先使用小程序内 `运营管理` 页面。

CloudBase Run 是容器化服务，适合运行 NestJS 这类常驻 HTTP API。服务端口使用云托管注入的 `PORT`，本项目也兼容原来的 `API_PORT`。

## 云托管环境变量

在 CloudBase Run 服务环境变量中配置：

```bash
NODE_ENV=production
PORT=3000
JWT_SECRET=<random-long-secret>
DATABASE_URL=mysql://booking_app:<password>@<mysql-host>:3306/boxing_booking
MINIAPP_APP_ID=<你的真实小程序 AppID>
MINIAPP_APP_SECRET=<你的真实小程序 AppSecret>
WECHAT_AUTO_PROVISION_ENABLED=false
WECHAT_NOTIFICATION_WORKER_ENABLED=false
BOOKING_CANCEL_CUTOFF_MINUTES=120
BUSINESS_TIMEZONE_OFFSET_MINUTES=480
```

真机调试阶段可以先把 `WECHAT_NOTIFICATION_WORKER_ENABLED=false`，避免订阅消息模板没配好时干扰约课主流程。后续要测通知时再打开。

## 云托管部署步骤

1. 在微信云开发/云托管创建环境。
2. 创建 CloudBase Run 服务，选择从代码或 Git 仓库构建。
3. 使用仓库根目录 `Dockerfile`。
4. 服务监听端口填 `3000`。
5. 启用云托管访问，确认服务名，例如 `booking-api`。
6. 在云端执行数据库 migration：

```bash
pnpm --filter @booking/api prisma:deploy
```

如果只是测试数据，可以在非 production 环境运行 seed；生产环境不要跑 demo seed。

真机调试早期可以在本地电脑、CI，或任何能连接云端 MySQL 的一次性执行环境中显式创建临时测试账号：

```bash
DATABASE_URL=mysql://booking_app:<password>@<mysql-host>:3306/boxing_booking \
pnpm --filter @booking/api seed:cloud-test-accounts
```

该命令会创建或更新两个临时测试账号：

- `admin/admin`：馆长账号，拥有当前拳馆所有活跃门店的 OWNER 权限。
- `test/test`：测试店长账号，拥有第一个活跃门店的 MANAGER 权限。

这两个弱密码账号只用于真机调试和协作者验收。正式上线前必须删除、禁用或改成强密码；它们不会自动创建，只有手动执行上面的命令才会写入数据库。小程序会员侧不使用账号密码登录，第二个微信号测试约课仍然走微信登录和会员绑定流程。

当前 MVP 登录口径：

- 账号登录：只给运营测试使用，默认只准备 `admin/admin` 和 `test/test` 两个 ADMIN 类账号。小程序账号登录会走后端 `POST /auth/account-login`，该入口只接受激活的 ADMIN 账号。
- 微信授权登录：会员侧继续使用微信绑定登录。未知微信号会拿到 6 位绑定码，由管理员在运营端或绑定脚本中完成绑定。
- 管理员微信身份：只绑定到固定真实 AppID 下的固定管理员账号，例如 `admin`；不要把同一个 openid 绑定给多个用户。

## 小程序构建

正式体验版不要把云托管默认 `run.tcloudbase.com` 域名填入微信公众平台 `request 合法域名`；微信会提示该域名仅可测试使用。构建体验版时改用云开发 `callContainer` 链路：

```bash
cross-env TARO_APP_AUTH_MODE=wechat \
  TARO_APP_CLOUDBASE_ENV_ID=<cloudbase-env-id> \
  TARO_APP_CLOUDBASE_SERVICE_NAME=booking-api \
  TARO_APP_BUSINESS_TIMEZONE_OFFSET_MINUTES=480 \
  pnpm --filter @booking/miniapp build:weapp
```

本地局域网真机调试仍可继续使用 `TARO_APP_API_BASE_URL=http://<LAN-IP>:4000`，只要不设置 `TARO_APP_CLOUDBASE_ENV_ID` 和 `TARO_APP_CLOUDBASE_SERVICE_NAME`，小程序请求会回落到普通 `Taro.request`。

然后在微信开发者工具打开：

```text
apps/miniapp/dist
```

不要打开 `apps/miniapp` 源码目录。

## 把你的当前微信号设为管理员

1. 用你的微信真机扫码打开预览版小程序。
2. 因为 `WECHAT_AUTO_PROVISION_ENABLED=false`，未绑定微信会显示 6 位绑定码。
3. 复制或拍下这个 6 位绑定码。
4. 用连接同一云端数据库的环境变量运行：

```bash
MINIAPP_APP_ID=<你的真实小程序 AppID> \
DATABASE_URL=mysql://booking_app:<password>@<mysql-host>:3306/boxing_booking \
pnpm --filter @booking/api wechat:bind-admin -- --username admin --binding-code <6位绑定码>
```

5. 重新打开小程序；这次微信登录会返回 `ADMIN` 身份。
6. 进入“我的”，应该能看到“运营管理”入口。

该脚本只把绑定码对应的 openid 绑定到已有 `admin` 用户；不会输出 openid，不会提交任何隐私数据。

## 真机预览二维码

生成二维码需要满足：

- 微信开发者工具已登录。
- 小程序项目使用真实 AppID，不是 `touristappid`。
- `apps/miniapp/dist` 已用云端 API 地址重新构建。
- 云托管 API `/health` 可用，或小程序 `callContainer` 能访问 `booking-api`。

满足后，可以在微信开发者工具中点击“预览”生成二维码；也可以用开发者工具 CLI 生成预览，但需要本机微信开发者工具已经登录并开启服务端口。

## 当前阶段验收清单

- [ ] 云托管服务 `booking-api` 的 `/health` 返回 `{ "ok": true }`。
- [ ] 小程序构建时 `TARO_APP_CLOUDBASE_ENV_ID` 指向当前云开发环境。
- [ ] 小程序构建时 `TARO_APP_CLOUDBASE_SERVICE_NAME=booking-api`。
- [ ] 微信后台无需填写 CloudBase 默认 `run.tcloudbase.com` 域名；如果未来绑定自有正式域名，再把自有 HTTPS 域名加入 request 合法域名。
- [ ] 你的微信号首次进入小程序能看到 6 位绑定码。
- [ ] 运行 `pnpm --filter @booking/api wechat:bind-admin -- --username admin --binding-code <code>` 后，你重新进入小程序能看到运营端。
- [ ] 第二个微信号可以作为会员测试约课；如果没有会员档案，先走绑定码流程。

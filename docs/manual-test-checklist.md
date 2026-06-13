# 手工测试清单

## 1. 本地环境准备

- [ ] 启动 MySQL：`pnpm dev:db`。
- [ ] 执行迁移和种子数据：`pnpm --filter @booking/api prisma:migrate && pnpm --filter @booking/api prisma:seed`。
- [ ] 启动 API：`pnpm api:dev`。
- [ ] 启动管理后台：`pnpm admin:dev`。
- [ ] 启动小程序 watch：`pnpm miniapp:dev`，确认它使用真实微信登录模式。
- [ ] 运行 `pnpm dev:status`，确认 API、管理后台和小程序 `dist` 都可预览。
- [ ] 运行 `pnpm dev:status:strict`，确认没有数据库端口漂移和孤儿 Prisma query-engine；若失败，先处理本地环境再继续真实微信验收。

## 2. 真实微信登录准备

- [ ] 在 `apps/api/.env` 中配置当前微信开发者工具使用的 `MINIAPP_APP_ID`。
- [ ] 在 `apps/api/.env` 中配置微信小程序后台的 `MINIAPP_APP_SECRET`。
- [ ] 确认接近生产的测试使用 `WECHAT_AUTO_PROVISION_ENABLED="false"`，未知微信账号必须由后台绑定会员。
- [ ] 运行 `pnpm --filter @booking/api wechat:check`，确认 AppID、AppSecret 和登录模式检查通过。
- [ ] 在微信开发者工具中打开小程序构建目录 `apps/miniapp/dist`，不要打开源码目录 `apps/miniapp`。
- [ ] 在当前 AppID 下添加至少两个测试微信账号。

## 3. 后台权限和排课

- [ ] 登录管理后台，地址以 `pnpm dev:status` 输出为准，账号 `admin` / `admin123456`。
- [ ] 确认后台门店选择器可以显示 `全部门店`、`城东店` 和 `城西店`。
- [ ] 在 `城东店` 创建一节未来课程。
- [ ] 在 `城西店` 创建一节未来课程。
- [ ] 退出后使用 `east-manager` / `manager123456` 登录。
- [ ] 确认店长只能选择 `城东店`，不能查看或操作 `城西店` 数据。

## 4. 会员绑定和约课

- [ ] 使用测试微信账号 A 打开小程序，确认它显示 6 位绑定码，而不是直接进入约课。
- [ ] 在后台创建或选择对应会员档案，用 6 位绑定码绑定测试微信账号 A。
- [ ] 重新打开小程序，确认账号 A 只能看到所属门店、对应剩余课时和自己的预约记录。
- [ ] 使用账号 A 预约一节 `城东店` 课程，并允许或拒绝订阅消息，确认拒绝订阅时仍能完成预约。
- [ ] 使用测试微信账号 B 打开小程序，确认它获得不同绑定码，且看不到账号 A 的预约。

## 5. 消课、取消和通知

- [ ] 在后台找到账号 A 的预约并执行消课。
- [ ] 确认重复消课会被拒绝。
- [ ] 确认账号 A 的剩余课时减少 1。
- [ ] 确认提醒预约会生成通知任务，并包含预约门店 ID。
- [ ] 再次使用 `east-manager` 登录，确认无法列出或消课 `城西店` 预约。
- [ ] 在微信开发者工具或真机中模拟离线、弱网或接口超时，确认课程、预约、账户和课程详情请求都显示可读中文错误和重试入口。
- [ ] 从后台取消一节课程，再重新打开会员小程序，确认受影响预约不再显示为可约/待上课，待发送提醒被跳过或替换为课程取消通知。

## 6. 视觉走查

- [ ] 运行 `pnpm miniapp:visual-qa`，确认当前截图矩阵状态；该命令不会打开微信开发者工具。
- [ ] 按 `pnpm miniapp:visual-qa:plan` 输出的下一台设备，在微信开发者工具中手动切换模拟器设备。
- [ ] 切到目标设备后，再显式执行 `MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture` 采集截图。
- [ ] 每采集一台设备后运行 `pnpm miniapp:visual-qa:next`，直到 4 台设备 x 3 个页面都补齐。
- [ ] 最后运行 `pnpm miniapp:visual-qa:check`，确认 12 张真实 PNG 截图全部存在且尺寸匹配。

## 7. 本地假会员调试

- [ ] 仅在本地假会员调试时运行 `pnpm miniapp:dev:local`。
- [ ] 确认阿杰、小林、东店同学切换入口出现。
- [ ] 假会员调试结束后重新运行 `pnpm miniapp:dev`，避免真实微信验收误用本地会员切换模式。

# 小程序多设备视觉走查记录

## 目标

在微信开发者工具中打开 `apps/miniapp/dist`，对拳馆约课小程序做多设备视觉走查，确认核心页面在常见手机尺寸下无遮挡、无文字溢出、无横向滚动、关键操作可点击，并补充真实截图。

## 当前环境

- API：`http://localhost:4000`
- 小程序构建目录：`apps/miniapp/dist`
- 开发登录模式：`TARO_APP_AUTH_MODE=dev`
- 种子会员：阿杰、东店同学、小林
- 当前工具状态：`/Applications/wechatwebdevtools.app` 已安装，服务端口已开启，当前端口为 `13667`。CLI 可打开 `apps/miniapp/dist`。
- 当前自动化状态：已接入安全默认的 `pnpm miniapp:visual-qa`。默认命令只输出矩阵状态，不打开微信开发者工具。普通 `pnpm miniapp:visual-qa:capture` 会先拒绝执行，避免误打开微信开发者工具；需要截图时必须显式设置 `MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1` 或传入 `--allow-devtools`。确认后该命令通过 `miniprogram-automator` 连接微信开发者工具，自动进入课程、预约、我的三页并保存当前模拟器截图，自动化端口从 `19000` 开始探测，遇到占用会递增避让。

## 设备矩阵

| 设备 | 视口 | 必看页面 | 截图文件 |
| --- | --- | --- | --- |
| iPhone SE | 375 x 667 | 课程、预约、我的 | `docs/manual-test-screenshots/iphone-se-classes.png` 等 |
| iPhone 12/13 Pro | 390 x 844 | 课程、预约、我的 | `docs/manual-test-screenshots/iphone-12-13-pro-classes.png`、`docs/manual-test-screenshots/iphone-12-13-pro-bookings.png`、`docs/manual-test-screenshots/iphone-12-13-pro-profile.png` |
| iPhone 15 Pro Max | 430 x 932 | 课程、预约、我的 | `docs/manual-test-screenshots/iphone-15-pro-max-classes.png`、`docs/manual-test-screenshots/iphone-15-pro-max-bookings.png`、`docs/manual-test-screenshots/iphone-15-pro-max-profile.png` |
| Nexus 6 | 412 x 732 | 课程、预约、我的 | `docs/manual-test-screenshots/nexus-6-classes.png`、`docs/manual-test-screenshots/nexus-6-bookings.png`、`docs/manual-test-screenshots/nexus-6-profile.png` |

## 页面检查项

### 课程页

- 门店/会员切换区域在小屏不遮挡标题和卡片。
- 加载态、空状态、错误重试状态有明确占位。
- 课程卡片内标题、教练、时间、剩余名额、说明不互相覆盖。
- 预约按钮可触达，禁用状态和已满/已取消状态可区分。
- 触发预约订阅消息拒绝后，预约流程仍可继续。

### 预约页

- 预约列表、取消按钮、状态标签在 375px 宽度下不挤压错位。
- 已取消、已消课、待上课状态文案清晰。
- 空状态和网络错误重试状态可见。
- 底部导航不遮挡列表最后一项操作按钮。

### 我的页

- 会员信息、剩余课时、门店信息在窄屏不溢出。
- 开发会员切换控件在小屏可点击，长名称不撑破布局。
- 重新登录/切换会员后数据刷新正确。

## 操作记录

| 日期 | 操作 | 结果 |
| --- | --- | --- |
| 2026-06-13 | 尝试用微信开发者工具 CLI 打开 `apps/miniapp/dist` | 失败：服务端口关闭，确认开启后仍等待 `.ide` 端口文件超时 |
| 2026-06-13 | 尝试系统截图获取工具窗口 | 失败：截图仅包含桌面壁纸，不是小程序模拟器真实画面 |
| 2026-06-13 | 用户手动开启服务端口后重新执行 `cli open --project apps/miniapp/dist --port 13667` | 成功：DevTools 打开目标项目 |
| 2026-06-13 | 课程页显示“课程加载失败”，检查 API 健康检查和课程接口 | 定位为 API dev server 已停止；重启 `pnpm api:dev` 后，课程接口返回 2 节课 |
| 2026-06-13 | 重新编译 `pnpm miniapp:dev` 并在 DevTools 强制刷新 | 成功：课程页恢复，iPhone 12/13 下无明显遮挡或文字溢出 |
| 2026-06-13 | 采集 iPhone 12/13 课程、预约、账户三页整窗截图 | 成功：截图已保存到 `docs/manual-test-screenshots/` |
| 2026-06-13 | 尝试自动展开设备下拉 | 部分失败：坐标点击不稳定，暂未完成批量设备切换 |
| 2026-06-13 | 启动 `cli auto --project apps/miniapp/dist --port 13667 --trust-project` | 成功：DevTools 返回 `auto` |
| 2026-06-13 | 新增并运行 `pnpm miniapp:visual-qa` | 成功：自动生成 iPhone 12/13 Pro 课程、预约、我的三页截图，脚本可自动避让已占用自动化端口 |
| 2026-06-13 | 基于截图修复预约状态徽标换行、长课程名撑开卡片、我的页提示卡贴边 | 成功：重新构建并重新截图后，窄屏布局无明显文字重叠或控件遮挡 |
| 2026-06-13 | 新增并运行 `pnpm miniapp:visual-qa:check` | 成功识别矩阵状态：当前 12 张必需截图中已存在 3 张，缺少 iPhone SE、iPhone 15 Pro Max、Nexus 6 的三页截图 |
| 2026-06-13 | 测试 `project.config.json` 的 `simulatorType` 字段 | 未生效：写入 `iPhone 15 Pro Max` 后 automator 仍返回当前 `iPhone 12/13 (Pro)`；已恢复原配置 |
| 2026-06-13 | 新增并运行 `pnpm miniapp:visual-qa:next` | 成功：当前提示下一台需切换到 `iPhone SE`，缺少课程、预约、我的三页截图 |
| 2026-06-13 | 调整 `pnpm miniapp:visual-qa` 默认行为 | 成功：默认只输出矩阵状态并标记 `opensDevTools: false`；截图动作改为显式 `pnpm miniapp:visual-qa:capture` |
| 2026-06-13 | 增强 `pnpm miniapp:visual-qa:check` | 成功：矩阵检查不只看文件名，还会拒绝非 PNG、空文件和尺寸明显不匹配目标设备的截图 |
| 2026-06-13 | 给 `pnpm miniapp:visual-qa:capture` 增加确认门槛 | 成功：未设置 `MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1` 时会在打开微信开发者工具前直接拒绝 |

## 自动化命令

```bash
pnpm miniapp:visual-qa:test
pnpm miniapp:visual-qa
MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture
pnpm miniapp:visual-qa:next
pnpm miniapp:visual-qa:check
```

默认 `pnpm miniapp:visual-qa` 只报告状态，不打开微信开发者工具。

普通 `pnpm miniapp:visual-qa:capture` 不会打开/连接微信开发者工具，会提示需要显式确认。补齐多设备矩阵时，先在 DevTools 切换模拟器设备，再执行 `MINIAPP_VISUAL_QA_ALLOW_DEVTOOLS=1 pnpm miniapp:visual-qa:capture`。

`pnpm miniapp:visual-qa:next` 会输出下一台缺失设备，便于逐台补齐截图。

`pnpm miniapp:visual-qa:plan` 会输出下一台设备、缺失页面和手动执行步骤，不打开或连接微信开发者工具。适合补截图前先确认当前矩阵状态。

`pnpm miniapp:visual-qa:check` 只检查文件矩阵，不启动 DevTools；当 12 张截图未全部存在、截图不是 PNG、或截图尺寸明显不匹配目标设备时会返回非零退出码，并输出缺失或无效的设备和页面。

## 完成标准

- `docs/manual-test-screenshots/` 下至少包含 4 个设备 x 3 个页面的真实微信开发者工具 PNG 截图。
- 每张截图能看到模拟器页面主体，不是桌面、空白窗口、构建产物文件或尺寸明显不匹配目标设备的图片。
- 本文设备矩阵对应的截图文件名已填写。
- `pnpm miniapp:visual-qa:check` 返回退出码 0。
- `docs/optimization-checklist.md` 中“微信开发者工具多设备视觉走查”可改为完成。

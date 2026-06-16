# 小程序运营端 MVP 设计

## 目标

在现有微信小程序内增加一个轻量运营端，让店长和管理员可以用手机完成日常运营动作：查看今日课程、创建/编辑/取消课程、查看预约名单、消课、手动取消预约、用绑定码绑定会员微信。首版不替代完整 Web Admin，只覆盖拳馆高频现场操作。

## 范围

首版运营端只对 `ADMIN` 用户显示入口。普通会员仍只看到约课、预约和账户。运营端入口放在账户页，进入独立页面 `pages/ops/index`，不新增底部 tab，避免普通用户误触和主导航复杂化。

首版功能：

- 当前门店切换。
- 今日运营摘要：今日课程数、预约数、待消课数、满员课程数。
- 课程管理：新建课程、编辑课程、取消课程。
- 预约名单：按当前门店展示预约，支持消课和手动取消。
- 会员绑定：搜索会员，输入 6 位绑定码绑定微信。

不在首版做：

- 批量排课、周期课模板、拖拽日历。
- Excel 导出、复杂报表、完整审计日志。
- 员工账号管理和权限配置。
- 会员全量复杂编辑。

## 架构

前端复用现有 Taro/React 页面结构和深色移动 UI。新增 `apps/miniapp/src/pages/ops/index.tsx` 和 `index.scss`。API 封装继续放在 `apps/miniapp/src/api.ts`，类型放在 `apps/miniapp/src/types.ts`。

后端首版不新增运营服务，复用已有 admin API：

- `GET /admin/metrics/daily`
- `GET|POST|PATCH /admin/classes`
- `POST /admin/classes/:id/cancel`
- `GET /admin/bookings`
- `POST /admin/bookings/:id/deduct`
- `POST /admin/bookings/:id/cancel`
- `GET /admin/members`
- `POST /admin/members/:id/wechat-bind`

权限仍由后端 `ADMIN` role 和门店 staff assignment 校验。小程序只负责隐藏入口和提供移动操作体验，不作为安全边界。

## 数据流

用户通过现有微信登录或本地登录拿到 JWT。账户页调用 `loadMemberSession` 后，如果 `user.role === 'ADMIN'` 且存在 `accessibleBranches`，显示运营入口。运营页使用同一个 token 请求 admin API，并按当前门店 `branchId` 拉取摘要、课程、预约和会员数据。

管理员的 `accessibleBranches` 是员工门店，不一定包含会员课时字段；会员端页面需要容忍 `lessonBalance` 缺失，避免管理员登录后显示异常。

## 错误处理

所有运营操作使用现有 `formatApiError` 归一化错误。高风险动作先弹确认框：取消课程、消课、手动取消预约、绑定微信。网络错误显示中文 toast 或错误状态卡，支持重新加载。

## 验证

新增脚本测试检查：

- 小程序注册运营页。
- 账户页只对 admin 显示运营入口。
- API 封装包含运营端需要的 admin 方法。
- 运营页包含课程管理、预约名单、会员绑定和高风险确认。
- 运营样式保持移动端触控尺寸和非 tab 入口。

构建验证使用 `pnpm --filter @booking/miniapp build:weapp`，完整门禁使用 `pnpm verify`。

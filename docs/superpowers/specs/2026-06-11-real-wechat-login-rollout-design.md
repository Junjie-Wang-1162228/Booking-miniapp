# Real WeChat Login Rollout Design

## Goal

Move the mini program from local fake member switching toward real WeChat-account testing while keeping the MVP safe to run locally. The current AppID in WeChat DevTools is used as the test mini program identity. Test users added in WeChat DevTools should be able to enter the mini program, receive a backend JWT based on their WeChat `openid`, book classes, and be deducted by the web admin.

## Core Clarification

The mini program AppID is not an admin account. It identifies the mini program application. Real user identity comes from WeChat login:

1. The mini program calls `wx.login`.
2. The mini program sends the temporary `code` to the API.
3. The API exchanges the `code` for `openid` through WeChat `code2Session`.
4. The API maps `(appId, openid)` to a local `User` through `WechatAccount`.
5. The API issues the same JWT format already used by booking APIs.

The web admin remains a normal backend/admin account. For this stage, admin login stays as username and password.

## Recommended Rollout

Use an auto-provisioning test mode first.

When a new WeChat `openid` logs in and no `WechatAccount` row exists, the API creates:

- One `User` with `role = USER`.
- One `WechatAccount` row with the current `MINIAPP_APP_ID` and returned `openid`.
- One `MemberBranch` row under the default active branch.
- One `LessonBalance` row for that branch.

This lets several WeChat accounts added in DevTools immediately test the full business path without waiting for a member-management screen. Later, before external user testing, the same endpoint can be switched to whitelist/bind-only mode by disabling auto-provisioning.

## Configuration

Add backend config:

- `MINIAPP_APP_ID`: current test mini program AppID.
- `MINIAPP_APP_SECRET`: mini program secret. Required for real WeChat `code2Session`.
- `WECHAT_LOGIN_MOCK_ENABLED`: allows local tests to bypass WeChat servers.
- `WECHAT_AUTO_PROVISION_ENABLED`: enables first-login test member creation.
- `WECHAT_AUTO_PROVISION_BRANCH_NAME`: optional branch name for new test members. If missing, use first active branch.
- `WECHAT_AUTO_PROVISION_LESSONS`: initial test lesson balance.

Mini program build config:

- `TARO_APP_AUTH_MODE`: `wechat` or `dev`.

Default local behavior should remain easy:

- API can run without AppSecret if mock login is enabled.
- Mini program defaults to `wechat` login for this rollout.
- Dev login remains callable for local debugging and automated tests.

## API Design

Add `POST /auth/wechat-login`.

Request:

```json
{
  "code": "wx-login-code"
}
```

Response: same shape as existing auth endpoints.

```json
{
  "accessToken": "jwt",
  "user": {
    "id": "user-id",
    "role": "USER",
    "displayName": "微信测试会员",
    "phone": null,
    "lessonBalance": { "remaining": 10 },
    "accessibleBranches": [],
    "defaultBranchId": "branch-id"
  }
}
```

Errors:

- Missing or invalid code: `400`.
- WeChat exchange fails: `401`.
- Unknown WeChat account and auto-provisioning disabled: `403`.
- No active branch available for auto-provisioning: `400`.

## User Naming

For test accounts, use deterministic display names so admin can tell users apart:

```text
微信测试会员-<last6 of openid>
```

This avoids asking for phone number or profile authorization in the first real-login stage.

## Data Isolation

The new member is still branch scoped:

- Classes list only for assigned branch.
- Bookings only for the logged-in user and branch.
- Lesson balance unique by `(userId, branchId)`.
- Deductions continue to require admin branch access.

No booking API should accept user identity from the request body; it continues to derive `userId` from JWT.

## Mini Program Behavior

Replace automatic member switching with automatic WeChat login:

- On page show, if a stored token exists, try `/auth/me`.
- If there is no token, call `Taro.login`, then `POST /auth/wechat-login`.
- Store JWT and selected default branch.
- Keep a development fallback function for `POST /auth/dev-login`.

Remove the visible `阿杰 / 小林` switcher from normal WeChat mode because real users must not be able to impersonate one another. In dev mode, the switcher can stay visible for local debugging.

## Notification Scope

No real subscription-message sending is required in this stage. Booking with reminder enabled must continue creating a `NotificationJob` with:

- `gymId`
- `branchId`
- `bookingId`
- `userId`
- `templateId` from config when provided

## Testing

Backend e2e tests must cover:

- Existing dev login still works.
- WeChat login returns an existing bound user.
- WeChat login auto-provisions a new user, WeChat account, branch membership, and balance.
- Auto-provisioning disabled rejects unknown WeChat account.
- Auto-provisioned user can book a class and produce a notification job.
- Admin can deduct the auto-provisioned user booking and balance decreases.

Mini program build must pass after switching login code.

Manual testing must cover:

- Open mini program in WeChat DevTools with the current AppID.
- Add multiple test WeChat accounts in DevTools.
- Confirm each account gets isolated bookings and balances.
- Confirm web admin can see and deduct those bookings.

## Future Hardening

Before inviting real gym members outside internal testing:

- Use the gym owner certified mini program subject.
- Disable broad auto-provisioning or restrict it to an invitation/whitelist path.
- Add member management in admin for assigning branch and initial lesson balance.
- Configure production HTTPS request domains.
- Add privacy policy and user data handling text.
- Add real subscription-message template selection and sending job.

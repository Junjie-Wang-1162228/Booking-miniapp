# Multi-Branch Boxing Booking Upgrade Design

## Goal

Upgrade the single-branch boxing booking MVP into a reusable multi-branch system for one gym owner operating two or more stores. The same mini program, admin web dashboard, API, and database should serve all branches while keeping member data, classes, bookings, lesson balances, and lesson deductions isolated by branch.

The first multi-branch version uses branch-isolated lesson balances. A lesson purchased for Branch A can only be booked and deducted in Branch A. Cross-branch packages are intentionally left as a future extension so the first upgrade keeps accounting and permission rules simple.

## Current MVP Baseline

The current MVP has these single-branch assumptions:

- `User` has one global `role`.
- `LessonBalance` is one row per user.
- `BoxingClass` has no branch or coach identity.
- `Booking`, `LessonDeduction`, and `NotificationJob` infer branch context indirectly from class or user data that does not yet exist.
- Admin users have global access to all booking and deduction data.

The upgrade should preserve the current core flows: member login, class listing, booking, cancellation, notification job creation, admin class management, admin booking search, and lesson deduction.

## Recommended Approach

Use a single-tenant, multi-branch model:

```text
Gym
  Branch
    MemberBranch
    StaffBranchAssignment
    BoxingClass
    Booking
    LessonBalance
    LessonDeduction
```

There is one `Gym` for the boxing gym owner in this stage. Multiple independent gyms or SaaS tenant isolation can be added later by treating `gymId` as the tenant boundary, but this design only needs to support one owner with multiple branches.

## Core Decisions

- One gym owner can operate multiple branches.
- Members are branch-scoped by default.
- Lesson balances are branch-scoped by default.
- A member can belong to more than one branch, but each branch has its own balance and member status.
- A coach can be assigned to multiple branches.
- Coach transfers are modeled with assignment date ranges, not by rewriting historical classes.
- Historical classes, bookings, and deductions keep the branch and coach used at the time.
- Backend APIs enforce branch access. Frontend filtering is only a convenience layer.
- The first upgrade does not implement payments, package purchase, commissions, cross-branch lesson packages, or multi-gym SaaS onboarding.

## Data Model

### New Tables

`gyms`

- `id`
- `name`
- `status`
- `createdAt`
- `updatedAt`

`branches`

- `id`
- `gymId`
- `name`
- `address`
- `phone`
- `status`
- `createdAt`
- `updatedAt`

`member_branches`

- `id`
- `gymId`
- `branchId`
- `userId`
- `memberNo`
- `status`
- `isDefault`
- `joinedAt`
- `createdAt`
- `updatedAt`

`staff_branch_assignments`

- `id`
- `gymId`
- `branchId`
- `userId`
- `role`
- `startsAt`
- `endsAt`
- `status`
- `createdAt`
- `updatedAt`

The `role` in `staff_branch_assignments` uses a dedicated staff role enum with `OWNER`, `MANAGER`, and `COACH`. `OWNER` can be attached to all branches for the current gym. A future SaaS version can add stronger organization-level ownership tables if needed.

### Existing Table Changes

`users`

- Keep global identity fields: `displayName`, `phone`, `username`, `passwordHash`, `wechatAccounts`, and status.
- Keep the current `USER` and `ADMIN` login roles for compatibility.
- Treat `USER` as mini program member access.
- Treat `ADMIN` as admin web login capability.
- Use `staff_branch_assignments.role` for owner, manager, and coach authorization.
- A staff user who needs admin web access must have `UserRole.ADMIN` plus at least one active staff branch assignment.
- A user can still be both a member and staff through separate `member_branches` and `staff_branch_assignments` rows.

`boxing_classes`

- Add `gymId`.
- Add `branchId`.
- Add optional `coachId`.
- Replace free-text coach as the source of truth with `coachId`.
- Add `coachNameSnapshot` for historical display. During migration, copy the current free-text `coach` value into `coachNameSnapshot`.

`bookings`

- Add `gymId`.
- Add `branchId`.
- Keep `userId`, `classId`, `status`, and `attendanceStatus`.
- Preserve duplicate prevention by user, class, and active status.
- Store branch directly to make branch filtering and audit queries explicit.

`lesson_balances`

- Add `gymId`.
- Add `branchId`.
- Change uniqueness from one balance per user to one balance per user per branch.
- Recommended unique key: `(userId, branchId)`.

`lesson_deductions`

- Add `gymId`.
- Add `branchId`.
- Keep immutable records and unique `bookingId`.
- Store `adminId` and use branch permission checks before deduction.

`notification_jobs`

- Add `gymId`.
- Add `branchId`.
- Continue linking to booking.
- Jobs should be skipped when a booking or class is canceled.

## Roles And Permissions

Use both identity-level and branch-scoped authorization.

### Member

Members can:

- See only branches where they have an active `member_branches` row.
- Select a current branch from their active branches.
- View available scheduled classes in the selected branch.
- Book classes only in the selected branch.
- Cancel only their own bookings in the selected branch.
- View only their own bookings, lesson balances, and deduction records for the selected branch.

Members cannot:

- View another branch unless assigned to it.
- Use Branch A lesson balance for Branch B.
- Access admin APIs.

### Owner

The owner can:

- View all branches under the gym.
- Switch the admin dashboard between all branches and a specific branch.
- Create, edit, and cancel classes in any branch.
- View bookings and deductions across all branches.
- Deduct lessons for any branch.
- Manage branch manager and coach assignments in a later admin settings module.

### Branch Manager

Branch managers can:

- View only assigned branches.
- Create, edit, and cancel classes for assigned branches.
- View bookings and deductions for assigned branches.
- Deduct lessons for assigned branches.

Branch managers cannot:

- Access unrelated branches.
- Move members or balances across branches unless a future permission explicitly allows it.

### Coach

Coaches can:

- View classes assigned to them.
- View branch schedules for branches where they have an active coach assignment.

Coaches should not deduct lessons in the first multi-branch upgrade unless the business explicitly chooses to allow it later.

## Branch Context

Branch context must be explicit in every branch-scoped API.

Recommended rules:

- Member mini program sends `branchId` for class list, booking list, deductions, and booking creation.
- Admin web sends optional `branchId` filter.
- Owner can omit `branchId` to view all branches.
- Branch manager requests are always constrained to assigned branches. If a manager has one branch, the backend can default to that branch when `branchId` is omitted. If a manager has multiple branches, `branchId` is required for branch-scoped writes.
- Backend validates access to `branchId` from JWT user identity and branch assignment tables.

Do not trust `branchId` from the frontend. Every API must verify that the authenticated user has access to that branch.

## API Changes

### Auth

`GET /auth/me` should return:

- User identity.
- Global role or login type.
- Accessible branches.
- Default branch for members.
- Admin branch access for owner, managers, and coaches.

The MVP `POST /auth/dev-login` should seed and return two members across two branches so data isolation can be tested immediately.

### Member APIs

`GET /branches/me`

- Returns active member branches.

`GET /classes?branchId=...`

- Returns scheduled future classes for the selected branch.

`POST /bookings`

- Requires `classId` and `branchId`.
- Verifies the class belongs to the branch.
- Verifies the member belongs to the branch.
- Verifies the member has at least one remaining lesson in that branch before booking.
- Enforces capacity and duplicate booking.

`GET /bookings/me?branchId=...`

- Returns only the current member's bookings for the selected branch.

`GET /deductions/me?branchId=...`

- Returns only the current member's deductions for the selected branch.

### Admin APIs

`GET /admin/branches`

- Returns branches the admin can access.

`GET /admin/classes?branchId=...`

- Owner can query one branch or all branches.
- Manager can query only assigned branches.

`POST /admin/classes`

- Requires `branchId`.
- Validates staff access to that branch.
- Validates coach assignment if `coachId` is provided.

`GET /admin/bookings?branchId=...&date=...&q=...&status=...`

- Applies branch access constraints before search filters.

`POST /admin/bookings/:id/deduct`

- Loads booking with branch.
- Verifies admin has deduction permission for that branch.
- Verifies booking is not canceled.
- Verifies no existing deduction exists.
- Verifies the member has remaining lesson balance for that same branch.
- Transactionally creates deduction, marks attendance, and decrements branch-scoped balance.

## Mini Program UX

The mini program should stay simple.

First screen behavior:

- If the member belongs to one branch, select it automatically.
- If the member belongs to multiple branches, show a compact branch selector near the top of the class list.
- The selected branch affects classes, bookings, lesson balance, and deduction history.

Class cards should show:

- Branch name when the user has more than one branch.
- Time, coach, capacity, remaining spots, and booking action.

Profile page should show:

- Current branch.
- Branch-scoped lesson balance.
- Branch-scoped deduction history.

The UI should not introduce a complex organization switcher. The member should feel like they are choosing the store they train at, not administering a system.

## Admin Web UX

Admin dashboard adds a branch scope control near the top:

```text
全部门店 / 城东店 / 城西店
```

Rules:

- Owner sees `全部门店` and every branch.
- Manager sees only assigned branches. If assigned to one branch, the branch selector can be hidden or locked.
- Coach-specific views can be added later; the first upgrade can expose coach data through class filters if needed.

Tables should include branch names when the current scope is all branches. In a single-branch scope, branch names can be visually de-emphasized.

## Coach Transfer Handling

Coach transfer is handled by `staff_branch_assignments`.

Example:

- Coach Leo assigned to Branch A from January 1 to March 31.
- Coach Leo assigned to Branch B from April 1 onward.
- Classes created in March at Branch A keep `branchId = A` and `coachId = Leo`.
- Classes created in April at Branch B use `branchId = B` and `coachId = Leo`.

Historical classes do not move when a coach changes branch. This keeps booking records and deduction audits stable.

## Migration Strategy

The upgrade should preserve MVP data by creating one default gym and one default branch:

- Create `Gym` named `拳馆约课`.
- Create `Branch` named `总店`.
- Attach existing classes, bookings, lesson balances, deductions, and notification jobs to that branch.
- Create active `member_branches` rows for existing member users.
- Create `OWNER` staff branch assignments for existing admin users on `总店`.

After migration, seed data should include:

- One gym.
- Two branches.
- One owner/admin.
- One branch manager assigned to `城东店`.
- One coach with historical assignment to `城东店` and active assignment to `城西店` to exercise transfer behavior.
- Members in different branches.
- Classes in both branches.
- Branch-scoped balances.

## Testing And Verification

Backend tests must prove:

- Member A in Branch A cannot see Branch B classes if they are not assigned to Branch B.
- Member A in Branch A cannot see Branch B bookings or deductions.
- A Branch A manager cannot list, edit, cancel, or deduct Branch B bookings.
- Owner can query all branches and a single branch.
- Booking creation rejects mismatched `classId` and `branchId`.
- Booking creation enforces capacity within the class branch.
- Duplicate booking rejection still works.
- Deduction decrements only the matching branch balance.
- Duplicate deduction rejection still works.
- Coach assignment validation rejects assigning a non-branch coach when creating a class.
- Coach transfer does not rewrite historical classes.

Frontend verification must prove:

- Mini program branch selector appears only when the member has multiple active branches.
- Class list changes when branch changes.
- My bookings and profile balance change with branch context.
- Admin branch selector filters bookings, classes, and deductions.
- Admin all-branch view shows branch names.
- Manager cannot access unrelated branch data even if manually changing request parameters.

## Future Extensions

The design leaves room for:

- Cross-branch lesson packages.
- Private lessons and group class package separation.
- Coach-specific dashboards.
- Branch revenue and sales attribution.
- Multiple independent gym tenants.
- Redis/BullMQ notification queue scaling.

These should not be included in the first multi-branch upgrade unless they become immediate business requirements.

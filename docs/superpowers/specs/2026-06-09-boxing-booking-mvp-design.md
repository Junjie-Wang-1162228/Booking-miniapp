# Boxing Gym Booking Mini Program MVP Design

## Goal

Build a minimum viable booking tool for a boxing gym. The user-facing experience is a WeChat mini program focused on fast class booking. The admin experience is a web dashboard for viewing bookings and deducting attended lessons. The product should be simple, visually polished, and suitable for a boxing gym style.

The MVP will first be developed and tested under the developer's personal WeChat mini program account as a development or trial version. Formal production release should use the boxing gym owner's business, company, or individual business owner subject after WeChat certification and filing.

## Recommended Stack

- User mini program: Taro + React
- Mini program UI library: NutUI Taro or equivalent Taro-compatible components
- Admin web: React
- Backend: NestJS
- Database: MySQL
- ORM: Prisma
- Authentication: JWT
- Authorization: RBAC
- Notifications: WeChat mini program subscription messages, backed by server-side notification jobs

This keeps the MVP maintainable without adding unnecessary distributed-system complexity. It also leaves room to scale later by adding Redis, a job queue, horizontal API instances, and database tuning.

## MVP Scope

### User Mini Program

The mini program should make booking obvious from the first screen. It should avoid complex navigation and use a mobile-first visual style with dark boxing-gym tones, strong red accents, clear cards, and large tap targets.

MVP user features:

- Log in through the mini program flow and bind to a local user account.
- View available classes.
- See class time, coach, capacity, remaining spots, and booking state.
- Book a class.
- Cancel the user's own booking before the class starts.
- View the user's own bookings and lesson deduction history.
- Opt in to a class reminder when booking if the WeChat subscription message template is available.

### Admin Web

The admin dashboard is a work tool, not a marketing page. It should be clean, dense enough for repeated use, and focused on finding bookings and deducting lessons quickly.

MVP admin features:

- Admin login.
- Create, edit, and cancel scheduled classes.
- View today's and upcoming bookings.
- Search/filter by member name, phone, class, booking status, and date.
- Mark a booking as attended and deduct one lesson.
- View lesson deduction records.
- Prevent duplicate lesson deduction for the same booking.

### Backend

The backend owns all permission and data isolation rules. Frontend UI state must not be trusted for access control.

MVP backend features:

- JWT login for users and admins.
- Role-based access control with at least `user` and `admin` roles.
- User APIs only return data belonging to the current authenticated user.
- Admin APIs can access gym-level booking and deduction data.
- Admin APIs can create, edit, and cancel scheduled classes.
- Booking creation checks class capacity and prevents duplicate active bookings by the same user for the same class.
- Booking cancellation checks ownership and booking state.
- Lesson deduction is transactional: create a deduction record, update booking attendance status, and decrement the user's lesson balance.
- Notification jobs are created when a user opts in to a reminder.

## Data Model

Core tables:

- `users`: members and admins, with role, display name, optional phone, and status.
- `wechat_accounts`: WeChat identity binding for mini program users, including mini program `openid` and optional `unionid`.
- `classes`: scheduled boxing classes, including title, coach, start time, duration, capacity, status, and description.
- `bookings`: user bookings, including user, class, status, timestamps, cancellation metadata, and attendance state.
- `lesson_balances`: member lesson balance for MVP; one row per user.
- `lesson_deductions`: immutable deduction records created by admins.
- `notification_jobs`: scheduled reminder jobs.
- `notification_logs`: send attempts and results.

The business account should use phone number or internal member ID as the durable business identity. WeChat `openid` is treated as an external identity binding because it can change when moving from a personal MVP AppID to a gym-owned production AppID.

## Permissions And Data Isolation

RBAC rules:

- `user` can view classes, create bookings, cancel their own bookings, and view only their own bookings/deductions.
- `admin` can view all classes, bookings, users, and deduction records, and can deduct lessons.
- `admin` can create, edit, and cancel scheduled classes.

Data isolation rules:

- User-scoped APIs derive `userId` from the JWT, not request parameters.
- Admin APIs require `admin` role.
- Any booking mutation checks both role and ownership/state.
- Lesson deduction cannot be performed by a regular user.
- Duplicate deduction for the same booking is rejected.

## Notifications

MVP notifications use WeChat mini program subscription messages.

Recommended notification events:

- Class reminder before start time, for example 2 hours before class.
- Class cancellation or major schedule change.
- Optional deduction confirmation after admin marks attendance.

Implementation notes:

- Users must explicitly authorize subscription messages in the mini program.
- Common mini program subscription messages are not unlimited push channels; each notification must comply with WeChat's template and authorization rules.
- Backend stores notification jobs and logs send attempts.
- Initial MVP can use NestJS scheduled jobs. Later scale can move to Redis + BullMQ without changing business APIs.

## WeChat Account And Production Strategy

Development strategy:

- Use the developer's personal mini program account for MVP development and internal trial only.
- Keep test user data separate from future production data.
- Keep AppID, API domain, template IDs, and other WeChat values in configuration.

Production strategy:

- The boxing gym owner should register and certify a business, company, or individual business owner mini program.
- The developer joins the gym-owned mini program as a project member.
- Deploy the same code to the production AppID.
- Complete mini program filing, privacy protection settings, server domain configuration, and service category review.

Do not rely on the personal mini program AppID as the long-term production identity. When moving to the gym-owned AppID, user `openid` values can change, so the system should support rebinding users by phone number or an internal member record.

## Public Account Strategy

The official account should not duplicate booking functionality in the MVP.

Recommended use:

- Gym introduction and content.
- Course announcements and promotions.
- Menu item or article card that opens the mini program.

Booking, cancellation, lesson history, and lesson deduction remain in the mini program and admin dashboard.

## UI Direction

User mini program:

- Mobile-first layout.
- Dark gym-inspired base, red action accents, high contrast text.
- Class cards with time, coach, availability, and a single obvious action.
- Bottom tabs for booking, my bookings, and profile.
- Large 44px+ touch targets.
- No instructional clutter on screen.

Admin dashboard:

- Clear table/list layout.
- Date filter and quick search.
- Status badges for booked, canceled, attended, deducted.
- Confirm dialog before deduction.
- Compact but readable layout for repeated daily use.

## Out Of Scope For MVP

- Online payment.
- Course package purchase.
- Multi-gym or multi-branch management.
- Complex coach scheduling.
- Waitlists.
- Refund rules.
- Public account booking duplication.
- Full production migration tooling.
- Advanced analytics.

## Testing And Verification

Minimum verification before calling the MVP complete:

- User can log in, view classes, book a class, cancel their own booking, and view only their own records.
- Two different users cannot see each other's bookings or deduction records.
- Admin can create a class that appears in the user mini program.
- Admin can view bookings and deduct a lesson.
- Regular user cannot call admin APIs.
- Duplicate deduction for the same booking is rejected.
- Class capacity is enforced.
- Notification job is created when a reminder is requested.
- User mini program UI works on small mobile dimensions.
- Admin web UI works on desktop and narrow tablet widths.

## Implementation Defaults

Confirmed decisions:

- Use Taro + React for the mini program.
- Use React Web for admin.
- Use NestJS + MySQL + Prisma for backend.
- Use JWT and RBAC.
- Use mini program subscription messages for notifications.
- Use personal mini program account only for MVP trial; use gym-owned subject for formal launch.
- Include lesson balances in the first MVP because lesson deduction is a core requirement.
- Include simple admin class management in the first MVP because users need real scheduled classes to book.
- Seed the development database with two users, one admin, and several sample boxing classes so the MVP can be tested immediately after setup.

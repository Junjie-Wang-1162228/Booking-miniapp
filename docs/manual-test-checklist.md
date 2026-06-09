# Manual Test Checklist

- [ ] Start MySQL with `pnpm dev:db`.
- [ ] Run migrations and seed with `pnpm --filter @booking/api prisma:migrate && pnpm --filter @booking/api prisma:seed`.
- [ ] Start API with `pnpm api:dev`.
- [ ] Start admin with `pnpm admin:dev`.
- [ ] Log in admin at `http://localhost:5173` with `admin` / `admin123456`.
- [ ] Create a future class.
- [ ] Open miniapp build in WeChat DevTools from `apps/miniapp`.
- [ ] Log in as 阿杰.
- [ ] Book the created class with reminder enabled.
- [ ] Switch to 小林 and verify 阿杰's booking is not visible.
- [ ] Use admin dashboard to deduct 阿杰's booking.
- [ ] Verify duplicate deduction is rejected.
- [ ] Verify 阿杰's lesson balance decreases by 1.
- [ ] Verify a notification job exists in the database for the reminder booking.

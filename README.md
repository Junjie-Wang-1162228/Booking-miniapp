# Boxing Booking Miniapp

MVP for a boxing gym booking mini program and admin dashboard.

## Local Development

1. Copy `.env.example` to `.env` in the root and in `apps/api/.env` when the API task is implemented.
2. Start MySQL with `pnpm dev:db`.
3. Run API migrations and seed data with `pnpm --filter @booking/api prisma:migrate` and `pnpm --filter @booking/api prisma:seed`.
4. Start the API with `pnpm api:dev`.
5. Start admin with `pnpm admin:dev`.
6. Start mini program build with `pnpm miniapp:dev`.

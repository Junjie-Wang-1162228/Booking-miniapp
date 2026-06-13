import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertingModule } from './alerts/alerts.module';
import { AppController } from './app.controller';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { BranchesModule } from './branches/branches.module';
import { ClassesModule } from './classes/classes.module';
import { CoachesModule } from './coaches/coaches.module';
import { SafeExceptionFilter } from './common/safe-exception.filter';
import { LessonDeductionsModule } from './lesson-deductions/lesson-deductions.module';
import { MembersModule } from './members/members.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    AlertingModule,
    PrismaModule,
    BranchesModule,
    AuthModule,
    ClassesModule,
    CoachesModule,
    NotificationsModule,
    BookingsModule,
    LessonDeductionsModule,
    MetricsModule,
    MembersModule,
    AuditLogsModule,
    RateLimitModule
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SafeExceptionFilter
    }
  ]
})
export class AppModule {}

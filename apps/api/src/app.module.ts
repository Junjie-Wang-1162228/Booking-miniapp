import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { ClassesModule } from './classes/classes.module';
import { LessonDeductionsModule } from './lesson-deductions/lesson-deductions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ClassesModule,
    NotificationsModule,
    BookingsModule,
    LessonDeductionsModule
  ],
  controllers: [AppController]
})
export class AppModule {}

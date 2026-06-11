import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [BranchesModule, NotificationsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService]
})
export class BookingsModule {}

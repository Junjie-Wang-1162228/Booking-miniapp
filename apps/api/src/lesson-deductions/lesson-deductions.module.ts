import { Module } from '@nestjs/common';
import {
  AdminBookingsController,
  AdminDeductionsController,
  DeductionsController
} from './lesson-deductions.controller';
import { LessonDeductionsService } from './lesson-deductions.service';

@Module({
  controllers: [AdminBookingsController, DeductionsController, AdminDeductionsController],
  providers: [LessonDeductionsService],
  exports: [LessonDeductionsService]
})
export class LessonDeductionsModule {}

import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import {
  AdminBookingsController,
  AdminDeductionsController,
  DeductionsController
} from './lesson-deductions.controller';
import { LessonDeductionsService } from './lesson-deductions.service';

@Module({
  imports: [BranchesModule],
  controllers: [AdminBookingsController, DeductionsController, AdminDeductionsController],
  providers: [LessonDeductionsService],
  exports: [LessonDeductionsService]
})
export class LessonDeductionsModule {}

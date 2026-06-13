import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { BranchesModule } from '../branches/branches.module';
import {
  AdminBookingsController,
  AdminDeductionsController,
  DeductionsController
} from './lesson-deductions.controller';
import { LessonDeductionsService } from './lesson-deductions.service';

@Module({
  imports: [BranchesModule, AuditLogsModule],
  controllers: [AdminBookingsController, DeductionsController, AdminDeductionsController],
  providers: [LessonDeductionsService],
  exports: [LessonDeductionsService]
})
export class LessonDeductionsModule {}

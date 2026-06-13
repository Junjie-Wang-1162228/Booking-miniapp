import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { BranchesModule } from '../branches/branches.module';
import { AdminCoachesController } from './coaches.controller';
import { CoachesService } from './coaches.service';

@Module({
  imports: [BranchesModule, AuditLogsModule],
  controllers: [AdminCoachesController],
  providers: [CoachesService],
  exports: [CoachesService]
})
export class CoachesModule {}

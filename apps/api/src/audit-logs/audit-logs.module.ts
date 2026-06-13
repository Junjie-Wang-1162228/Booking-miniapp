import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { AdminAuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

@Module({
  imports: [BranchesModule],
  controllers: [AdminAuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService]
})
export class AuditLogsModule {}

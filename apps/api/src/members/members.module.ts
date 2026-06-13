import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { BranchesModule } from '../branches/branches.module';
import { AdminMembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [BranchesModule, AuditLogsModule],
  controllers: [AdminMembersController],
  providers: [MembersService],
  exports: [MembersService]
})
export class MembersModule {}

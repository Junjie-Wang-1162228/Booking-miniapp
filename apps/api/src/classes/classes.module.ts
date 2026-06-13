import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { BranchesModule } from '../branches/branches.module';
import { AdminClassesController, ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [BranchesModule, AuditLogsModule],
  controllers: [ClassesController, AdminClassesController],
  providers: [ClassesService],
  exports: [ClassesService]
})
export class ClassesModule {}

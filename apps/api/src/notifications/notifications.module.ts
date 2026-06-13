import { Module } from '@nestjs/common';
import { AlertingModule } from '../alerts/alerts.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { BranchesModule } from '../branches/branches.module';
import { AdminNotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [BranchesModule, AuditLogsModule, AlertingModule],
  controllers: [AdminNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService]
})
export class NotificationsModule {}

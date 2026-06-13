import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditLogsService } from './audit-logs.service';
import { AdminAuditLogQueryDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: AdminAuditLogQueryDto) {
    return this.auditLogs.listAdminAuditLogs(user.sub, query);
  }
}

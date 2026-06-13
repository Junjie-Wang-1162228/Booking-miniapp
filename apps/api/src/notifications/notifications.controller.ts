import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminNotificationQueryDto } from './dto';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: AdminNotificationQueryDto) {
    return this.notifications.listAdminNotificationJobs(user.sub, query);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.notifications.retryAdminNotificationJob(user.sub, id);
  }
}

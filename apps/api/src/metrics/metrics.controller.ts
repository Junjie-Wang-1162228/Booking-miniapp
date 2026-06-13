import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminDailyMetricsQueryDto } from './dto';
import { MetricsService } from './metrics.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/metrics')
export class AdminMetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('daily')
  getDailyMetrics(@CurrentUser() user: JwtUser, @Query() query: AdminDailyMetricsQueryDto) {
    return this.metrics.getAdminDailyMetrics(user.sub, query);
  }
}

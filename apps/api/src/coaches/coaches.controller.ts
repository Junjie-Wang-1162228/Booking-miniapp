import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CoachesService } from './coaches.service';
import { AdminCoachQueryDto, CreateCoachDto, UpdateCoachDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/coaches')
export class AdminCoachesController {
  constructor(private readonly coaches: CoachesService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: AdminCoachQueryDto) {
    return this.coaches.listAdminCoaches(user.sub, query);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateCoachDto) {
    return this.coaches.createAdminCoach(user.sub, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateCoachDto) {
    return this.coaches.updateAdminCoach(user.sub, id, dto);
  }
}

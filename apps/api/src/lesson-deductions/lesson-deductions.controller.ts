import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminBookingQueryDto, DeductLessonDto } from './dto';
import { LessonDeductionsService } from './lesson-deductions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly lessonDeductions: LessonDeductionsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: AdminBookingQueryDto) {
    return this.lessonDeductions.listAdminBookings(user.sub, query);
  }

  @Post(':id/deduct')
  deduct(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: DeductLessonDto) {
    return this.lessonDeductions.deductLesson(user.sub, id, dto);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
@Controller('deductions')
export class DeductionsController {
  constructor(private readonly lessonDeductions: LessonDeductionsService) {}

  @Get('me')
  listMine(@CurrentUser() user: JwtUser, @Query('branchId') branchId: string) {
    return this.lessonDeductions.listMine(user.sub, branchId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/deductions')
export class AdminDeductionsController {
  constructor(private readonly lessonDeductions: LessonDeductionsService) {}

  @Get()
  listAdminDeductions(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.lessonDeductions.listAdminDeductions(user.sub, branchId);
  }
}

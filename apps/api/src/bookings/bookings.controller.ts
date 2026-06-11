import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtUser } from '../auth/auth.types';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('me')
  listMine(@CurrentUser() user: JwtUser, @Query('branchId') branchId: string) {
    return this.bookings.listMine(user.sub, branchId);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateBookingDto) {
    return this.bookings.createBooking(user.sub, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.bookings.cancelBooking(user.sub, id);
  }
}

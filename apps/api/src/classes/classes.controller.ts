import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ClassesService } from './classes.service';
import { CreateClassDto, UpdateClassDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  listAvailable(@CurrentUser() user: JwtUser, @Query('branchId') branchId: string) {
    return this.classes.listAvailable(user.sub, branchId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/classes')
export class AdminClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  listAdmin(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.classes.listAdmin(user.sub, branchId);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateClassDto) {
    return this.classes.create(user.sub, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classes.update(user.sub, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.classes.cancel(user.sub, id);
  }
}

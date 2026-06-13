import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  AdminMemberLedgerQueryDto,
  AdminMemberQueryDto,
  AdjustLessonBalanceDto,
  BindWechatDto,
  CreateMemberDto,
  UnbindWechatDto,
  UpdateMemberDto
} from './dto';
import { MembersService } from './members.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/members')
export class AdminMembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: AdminMemberQueryDto) {
    return this.members.listAdminMembers(user.sub, query);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateMemberDto) {
    return this.members.createAdminMember(user.sub, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.members.updateAdminMember(user.sub, id, dto);
  }

  @Get(':id/lesson-ledger')
  lessonLedger(@CurrentUser() user: JwtUser, @Param('id') id: string, @Query() query: AdminMemberLedgerQueryDto) {
    return this.members.listMemberLessonLedger(user.sub, id, query);
  }

  @Post(':id/wechat-bind')
  @HttpCode(200)
  bindWechat(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: BindWechatDto) {
    return this.members.bindWechat(user.sub, id, dto);
  }

  @Post(':id/wechat-unbind')
  @HttpCode(200)
  unbindWechat(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UnbindWechatDto) {
    return this.members.unbindWechat(user.sub, id, dto);
  }

  @Post(':id/lesson-adjustments')
  @HttpCode(200)
  adjustLessons(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: AdjustLessonBalanceDto) {
    return this.members.adjustLessonBalance(user.sub, id, dto);
  }
}

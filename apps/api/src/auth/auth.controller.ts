import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { AdminLoginDto, DevLoginDto, WechatLoginDto } from './dto';
import { JwtUser } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LocalAuthGuard } from './local-auth.guard';
import { RateLimited } from '../rate-limit/rate-limit.decorator';

type AccountLoginRequest = Request & {
  user: User;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('admin-login')
  @RateLimited('login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.auth.adminLogin(dto.username, dto.password);
  }

  @Post('account-login')
  @RateLimited('login')
  @UseGuards(LocalAuthGuard)
  accountLogin(@Req() request: AccountLoginRequest) {
    return this.auth.accountLogin(request.user);
  }

  @Post('dev-login')
  @RateLimited('login')
  devLogin(@Body() dto: DevLoginDto) {
    return this.auth.devLogin(dto.member);
  }

  @Post('wechat-login')
  @RateLimited('login')
  wechatLogin(@Body() dto: WechatLoginDto) {
    return this.auth.wechatLogin(dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.auth.getMe(user.sub);
  }
}

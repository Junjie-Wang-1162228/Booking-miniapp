import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BranchAccessService } from './branch-access.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchAccess: BranchAccessService) {}

  @Get('me')
  listMine(@CurrentUser() user: JwtUser) {
    return this.branchAccess.listMemberBranches(user.sub);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/branches')
export class AdminBranchesController {
  constructor(private readonly branchAccess: BranchAccessService) {}

  @Get()
  listAdminBranches(@CurrentUser() user: JwtUser) {
    return this.branchAccess.listAdminBranches(user.sub);
  }
}

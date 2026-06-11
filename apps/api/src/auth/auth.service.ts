import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { BranchAccessService } from '../branches/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly branchAccess: BranchAccessService
  ) {}

  async adminLogin(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username }
    });

    if (!user || user.role !== UserRole.ADMIN || !user.passwordHash) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    return this.createSession(user);
  }

  async devLogin(member: 'member-a' | 'member-b') {
    const phone = member === 'member-a' ? '18800000001' : '18800000002';
    const user = await this.prisma.user.findUnique({
      where: { phone }
    });

    if (!user || user.role !== UserRole.USER) {
      throw new BadRequestException('Development member is not seeded');
    }

    return this.createSession(user);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return this.toPublicUser(user);
  }

  private async createSession(user: User) {
    const payload: JwtUser = {
      sub: user.id,
      role: user.role,
      displayName: user.displayName
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: await this.toPublicUser(user)
    };
  }

  private async toPublicUser(user: User) {
    const accessibleBranches =
      user.role === UserRole.USER
        ? await this.branchAccess.listMemberBranches(user.id)
        : await this.branchAccess.listAdminBranches(user.id);
    const defaultBranch =
      accessibleBranches.find((branch) => 'isDefault' in branch && branch.isDefault) ?? accessibleBranches[0];
    const defaultLessonBalance =
      defaultBranch && 'lessonBalance' in defaultBranch ? defaultBranch.lessonBalance : null;

    return {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      phone: user.phone,
      lessonBalance: defaultLessonBalance,
      accessibleBranches,
      defaultBranchId: defaultBranch?.id ?? null
    };
  }
}

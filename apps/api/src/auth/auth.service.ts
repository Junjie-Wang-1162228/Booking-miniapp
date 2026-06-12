import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { BranchAccessService } from '../branches/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from './auth.types';
import { isWechatAutoProvisionEnabled } from './security-config';

const developmentMemberPhones = {
  'member-a': '18800000001',
  'member-b': '18800000002',
  'member-c': '18800000003'
} as const;

type DevelopmentMember = keyof typeof developmentMemberPhones;
type WechatSession = {
  openid: string;
  unionid?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly branchAccess: BranchAccessService,
    private readonly config: ConfigService
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

  async devLogin(member: DevelopmentMember) {
    const phone = developmentMemberPhones[member];
    const user = await this.prisma.user.findUnique({
      where: { phone }
    });

    if (!user || user.role !== UserRole.USER) {
      throw new BadRequestException('Development member is not seeded');
    }

    return this.createSession(user);
  }

  async wechatLogin(code: string) {
    const session = await this.exchangeWechatCode(code);
    const appId = this.getMiniappAppId();
    const existingAccount = await this.prisma.wechatAccount.findUnique({
      where: { appId_openid: { appId, openid: session.openid } },
      include: { user: true }
    });

    if (existingAccount) {
      return this.createSession(existingAccount.user);
    }

    if (!isWechatAutoProvisionEnabled(this.config)) {
      throw new ForbiddenException('Wechat account is not bound to a member');
    }

    const user = await this.autoProvisionWechatMember(appId, session.openid, session.unionid);
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

  private async exchangeWechatCode(code: string): Promise<WechatSession> {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      throw new BadRequestException('Wechat login code is required');
    }

    if (this.isEnabled('WECHAT_LOGIN_MOCK_ENABLED', false)) {
      const mockOpenid = trimmedCode.startsWith('mock:') ? trimmedCode.slice('mock:'.length) : trimmedCode;
      if (!mockOpenid) {
        throw new BadRequestException('Wechat login code is required');
      }
      return { openid: mockOpenid };
    }

    const appId = this.getMiniappAppId();
    const appSecret = this.config.get<string>('MINIAPP_APP_SECRET');
    if (!appSecret) {
      throw new UnauthorizedException('Wechat app secret is not configured');
    }

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appId);
    url.searchParams.set('secret', appSecret);
    url.searchParams.set('js_code', trimmedCode);
    url.searchParams.set('grant_type', 'authorization_code');

    let data: { openid?: string; unionid?: string; errcode?: number; errmsg?: string };
    try {
      const response = await fetch(url);
      data = (await response.json()) as typeof data;
    } catch {
      throw new UnauthorizedException('Wechat login exchange failed');
    }

    if (data.errcode || !data.openid) {
      throw new UnauthorizedException(data.errmsg || 'Wechat login exchange failed');
    }

    return { openid: data.openid, unionid: data.unionid };
  }

  private async autoProvisionWechatMember(appId: string, openid: string, unionid?: string) {
    const branch = await this.resolveAutoProvisionBranch();
    const lessonCount = this.getAutoProvisionLessons();
    const displayName = `微信测试会员-${this.openidSuffix(openid)}`;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: UserRole.USER,
          displayName
        }
      });

      await tx.wechatAccount.create({
        data: {
          userId: user.id,
          appId,
          openid,
          unionid
        }
      });

      await tx.memberBranch.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          userId: user.id,
          isDefault: true
        }
      });

      await tx.lessonBalance.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          userId: user.id,
          remaining: lessonCount
        }
      });

      return user;
    });
  }

  private async resolveAutoProvisionBranch() {
    const branchName = this.config.get<string>('WECHAT_AUTO_PROVISION_BRANCH_NAME')?.trim();
    const branch = branchName
      ? await this.prisma.branch.findFirst({ where: { name: branchName, status: 'ACTIVE' } })
      : await this.prisma.branch.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });

    if (!branch) {
      throw new BadRequestException('No active branch is available for WeChat test members');
    }

    return branch;
  }

  private getMiniappAppId() {
    return this.config.get<string>('MINIAPP_APP_ID') || 'personal-mvp-appid';
  }

  private getAutoProvisionLessons() {
    const configured = Number(this.config.get<string>('WECHAT_AUTO_PROVISION_LESSONS') ?? '10');
    return Number.isInteger(configured) && configured >= 0 ? configured : 10;
  }

  private openidSuffix(openid: string) {
    const normalized = openid.replace(/[^a-zA-Z0-9]/g, '');
    return normalized.slice(-6) || 'member';
  }

  private isEnabled(key: string, defaultValue: boolean) {
    const value = this.config.get<string>(key);
    if (value === undefined) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
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

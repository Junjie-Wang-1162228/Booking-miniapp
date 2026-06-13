import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StaffRole, UserRole } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BranchAccessService } from '../branches/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminMemberLedgerQueryDto,
  AdminMemberQueryDto,
  AdjustLessonBalanceDto,
  BindWechatDto,
  CreateMemberDto,
  UnbindWechatDto,
  UpdateMemberDto
} from './dto';

type MemberBranchWithDetails = Prisma.MemberBranchGetPayload<{
  include: {
    branch: true;
    user: {
      include: {
        lessonBalances: true;
        wechatAccounts: true;
      };
    };
  };
}>;

type LessonBalanceAdjustmentRecord = Prisma.LessonBalanceAdjustmentGetPayload<Record<string, never>>;

type LessonBalanceAdjustmentWithAdmin = Prisma.LessonBalanceAdjustmentGetPayload<{
  include: {
    admin: true;
  };
}>;

type LessonDeductionLedgerRecord = Prisma.LessonDeductionGetPayload<{
  include: {
    admin: true;
    booking: { include: { boxingClass: true } };
  };
}>;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async listAdminMembers(adminId: string, query: AdminMemberQueryDto) {
    const branchScope = await this.branchAccess.resolveAdminBranchScope(adminId, query.branchId);
    const where: Prisma.MemberBranchWhereInput = {
      branchId: { in: branchScope.branchIds },
      status: 'ACTIVE',
      user: { role: UserRole.USER }
    };

    if (query.q) {
      where.OR = [
        { memberNo: { contains: query.q } },
        { user: { displayName: { contains: query.q } } },
        { user: { phone: { contains: query.q } } },
        { branch: { name: { contains: query.q } } }
      ];
    }

    const memberBranches = await this.prisma.memberBranch.findMany({
      where,
      include: this.memberBranchInclude(),
      orderBy: [{ joinedAt: 'desc' }, { createdAt: 'desc' }]
    });

    return memberBranches.map((memberBranch) => this.toAdminMemberView(memberBranch));
  }

  async createAdminMember(adminId: string, dto: CreateMemberDto) {
    const branch = await this.branchAccess.ensureBranchExists(dto.branchId);
    await this.branchAccess.ensureAdminBranchRole(adminId, branch.id, [StaffRole.OWNER, StaffRole.MANAGER]);

    const phone = dto.phone?.trim() || null;
    if (phone) {
      const existingPhone = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (existingPhone) {
        throw new ConflictException('Member phone already exists');
      }
    }

    const appId = dto.wechatOpenid ? this.resolveWechatAppId(dto.wechatAppId) : null;
    const openid = dto.wechatOpenid?.trim() || null;
    if (appId && openid) {
      await this.ensureWechatOpenidAvailable(appId, openid);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          role: UserRole.USER,
          displayName: dto.displayName.trim(),
          phone
        }
      });

      await tx.memberBranch.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          userId: createdUser.id,
          memberNo: dto.memberNo?.trim() || null,
          isDefault: true
        }
      });

      await tx.lessonBalance.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          userId: createdUser.id,
          remaining: dto.initialLessons ?? 0
        }
      });

      if (appId && openid) {
        await tx.wechatAccount.create({
          data: {
            userId: createdUser.id,
            appId,
            openid,
            unionid: dto.wechatUnionid?.trim() || null
          }
        });
      }

      return createdUser;
    });

    await this.auditLogs.record({
      gymId: branch.gymId,
      branchId: branch.id,
      adminId,
      action: 'MEMBER_CREATE',
      entityType: 'User',
      entityId: user.id,
      message: `创建会员：${user.displayName}`,
      metadata: {
        memberNo: dto.memberNo?.trim() || null,
        initialLessons: dto.initialLessons ?? 0,
        hasPhone: Boolean(phone)
      }
    });

    if (appId && openid) {
      await this.auditLogs.record({
        gymId: branch.gymId,
        branchId: branch.id,
        adminId,
        action: 'WECHAT_BIND',
        entityType: 'User',
        entityId: user.id,
        message: '绑定会员微信账号',
        metadata: {
          appId,
          source: 'member-create'
        }
      });
    }

    return this.getAdminMemberView(adminId, user.id, branch.id);
  }

  async updateAdminMember(adminId: string, memberId: string, dto: UpdateMemberDto) {
    const memberBranch = await this.ensureAdminCanManageMemberBranch(adminId, memberId, dto.branchId);
    const userData: Prisma.UserUpdateInput = {};
    const memberBranchData: Prisma.MemberBranchUpdateInput = {};
    const updatedFields: string[] = [];

    if (dto.displayName !== undefined) {
      const displayName = dto.displayName.trim();
      if (!displayName) {
        throw new BadRequestException('Member display name is required');
      }
      userData.displayName = displayName;
      updatedFields.push('displayName');
    }

    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      const existingPhone = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (existingPhone && existingPhone.id !== memberId) {
        throw new ConflictException('Member phone already exists');
      }
      userData.phone = phone;
      updatedFields.push('phone');
    }

    if (dto.memberNo !== undefined) {
      memberBranchData.memberNo = dto.memberNo.trim() || null;
      updatedFields.push('memberNo');
    }

    if (updatedFields.length === 0) {
      throw new BadRequestException('No member details to update');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({
          where: { id: memberId },
          data: userData
        });
      }

      if (Object.keys(memberBranchData).length > 0) {
        await tx.memberBranch.update({
          where: { userId_branchId: { userId: memberId, branchId: dto.branchId } },
          data: memberBranchData
        });
      }

      return tx.memberBranch.findUniqueOrThrow({
        where: { userId_branchId: { userId: memberId, branchId: dto.branchId } },
        include: this.memberBranchInclude()
      });
    });

    const memberView = this.toAdminMemberView(updated);
    await this.auditLogs.record({
      gymId: memberBranch.gymId,
      branchId: memberBranch.branchId,
      adminId,
      action: 'MEMBER_UPDATE',
      entityType: 'User',
      entityId: memberId,
      message: `更新会员资料：${memberView.displayName}`,
      metadata: {
        updatedFields
      }
    });

    return memberView;
  }

  async bindWechat(adminId: string, memberId: string, dto: BindWechatDto) {
    const memberBranch = await this.ensureAdminCanManageMemberBranch(adminId, memberId, dto.branchId);
    const appId = this.resolveWechatAppId(dto.wechatAppId);
    const ticket = dto.bindingCode ? await this.resolveWechatBindingTicket(appId, dto.bindingCode) : null;
    const openid = ticket?.openid ?? dto.wechatOpenid?.trim();

    if (!openid) {
      throw new BadRequestException('Wechat binding code or openid is required');
    }

    await this.ensureWechatOpenidAvailable(appId, openid);

    await this.prisma.$transaction(async (tx) => {
      await tx.wechatAccount.create({
        data: {
          userId: memberId,
          appId,
          openid,
          unionid: ticket?.unionid ?? dto.wechatUnionid?.trim() ?? null
        }
      });

      if (ticket) {
        await tx.wechatBindingTicket.update({
          where: { id: ticket.id },
          data: {
            status: 'BOUND',
            boundUserId: memberId
          }
        });
      }
    });

    await this.auditLogs.record({
      gymId: memberBranch.gymId,
      branchId: memberBranch.branchId,
      adminId,
      action: 'WECHAT_BIND',
      entityType: 'User',
      entityId: memberId,
      message: '绑定会员微信账号',
      metadata: {
        appId,
        source: ticket ? 'binding-code' : 'openid'
      }
    });

    return this.getAdminMemberView(adminId, memberId, dto.branchId);
  }

  async unbindWechat(adminId: string, memberId: string, dto: UnbindWechatDto) {
    const memberBranch = await this.ensureAdminCanManageMemberBranch(adminId, memberId, dto.branchId);
    const appId = this.resolveWechatAppId(dto.wechatAppId);

    const result = await this.prisma.wechatAccount.deleteMany({
      where: {
        userId: memberId,
        appId
      }
    });

    if (result.count === 0) {
      throw new NotFoundException('Wechat account binding not found');
    }

    await this.auditLogs.record({
      gymId: memberBranch.gymId,
      branchId: memberBranch.branchId,
      adminId,
      action: 'WECHAT_UNBIND',
      entityType: 'User',
      entityId: memberId,
      message: '解绑会员微信账号',
      metadata: {
        appId
      }
    });

    return this.getAdminMemberView(adminId, memberId, dto.branchId);
  }

  async adjustLessonBalance(adminId: string, memberId: string, dto: AdjustLessonBalanceDto) {
    const memberBranch = await this.ensureAdminCanManageMemberBranch(adminId, memberId, dto.branchId);
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Lesson adjustment reason is required');
    }

    const adjustment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM LessonBalance WHERE userId = ${memberId} AND branchId = ${dto.branchId} FOR UPDATE
      `;

      const lessonBalance = await tx.lessonBalance.findUnique({
        where: { userId_branchId: { userId: memberId, branchId: dto.branchId } }
      });

      if (!lessonBalance) {
        throw new NotFoundException('Lesson balance not found');
      }

      const beforeRemaining = lessonBalance.remaining;
      const afterRemaining = beforeRemaining + dto.delta;
      if (afterRemaining < 0) {
        throw new BadRequestException('Lesson balance cannot be negative');
      }

      await tx.lessonBalance.update({
        where: { userId_branchId: { userId: memberId, branchId: dto.branchId } },
        data: { remaining: afterRemaining }
      });

      return tx.lessonBalanceAdjustment.create({
        data: {
          gymId: memberBranch.gymId,
          branchId: dto.branchId,
          userId: memberId,
          adminId,
          delta: dto.delta,
          beforeRemaining,
          afterRemaining,
          reason
        }
      });
    });

    await this.auditLogs.record({
      gymId: adjustment.gymId,
      branchId: adjustment.branchId,
      adminId,
      action: 'LESSON_ADJUST',
      entityType: 'User',
      entityId: memberId,
      message: `课时调整：${dto.delta > 0 ? '+' : ''}${dto.delta}，${reason}`,
      metadata: {
        adjustmentId: adjustment.id,
        delta: adjustment.delta,
        beforeRemaining: adjustment.beforeRemaining,
        afterRemaining: adjustment.afterRemaining,
        reason: adjustment.reason
      }
    });

    return {
      member: await this.getAdminMemberView(adminId, memberId, dto.branchId),
      adjustment: this.toLessonBalanceAdjustmentView(adjustment)
    };
  }

  async listMemberLessonLedger(adminId: string, memberId: string, query: AdminMemberLedgerQueryDto) {
    await this.ensureAdminCanManageMemberBranch(adminId, memberId, query.branchId);

    const [member, adjustments, deductions] = await Promise.all([
      this.getAdminMemberView(adminId, memberId, query.branchId),
      this.prisma.lessonBalanceAdjustment.findMany({
        where: { userId: memberId, branchId: query.branchId },
        include: { admin: true },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.lessonDeduction.findMany({
        where: { userId: memberId, branchId: query.branchId },
        include: {
          admin: true,
          booking: { include: { boxingClass: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const entries = [
      ...adjustments.map((adjustment) => this.toLessonLedgerAdjustmentEntry(adjustment)),
      ...deductions.map((deduction) => this.toLessonLedgerDeductionEntry(deduction))
    ].sort((left, right) => {
      const timeDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      if (left.type === right.type) return 0;
      return left.type === 'DEDUCTION' ? -1 : 1;
    });

    return { member, entries };
  }

  private async getAdminMemberView(adminId: string, memberId: string, branchId: string) {
    await this.ensureAdminCanManageMemberBranch(adminId, memberId, branchId);
    const memberBranch = await this.prisma.memberBranch.findUniqueOrThrow({
      where: { userId_branchId: { userId: memberId, branchId } },
      include: this.memberBranchInclude()
    });

    return this.toAdminMemberView(memberBranch);
  }

  private async ensureAdminCanManageMemberBranch(adminId: string, memberId: string, branchId: string) {
    await this.branchAccess.ensureAdminBranchRole(adminId, branchId, [StaffRole.OWNER, StaffRole.MANAGER]);

    const memberBranch = await this.prisma.memberBranch.findUnique({
      where: { userId_branchId: { userId: memberId, branchId } },
      include: { user: { select: { role: true } } }
    });

    if (!memberBranch || memberBranch.status !== 'ACTIVE' || memberBranch.user.role !== UserRole.USER) {
      throw new NotFoundException('Member not found in this branch');
    }

    return memberBranch;
  }

  private async ensureWechatOpenidAvailable(appId: string, openid: string) {
    const existing = await this.prisma.wechatAccount.findUnique({
      where: { appId_openid: { appId, openid } },
      select: { id: true }
    });

    if (existing) {
      throw new ConflictException('Wechat openid is already bound');
    }
  }

  private async resolveWechatBindingTicket(appId: string, code: string) {
    const ticket = await this.prisma.wechatBindingTicket.findUnique({
      where: { appId_code: { appId, code } }
    });

    if (!ticket || ticket.status !== 'PENDING' || ticket.expiresAt <= new Date()) {
      throw new NotFoundException('Wechat binding code is invalid or expired');
    }

    return ticket;
  }

  private memberBranchInclude() {
    return {
      branch: true,
      user: {
        include: {
          lessonBalances: true,
          wechatAccounts: true
        }
      }
    } satisfies Prisma.MemberBranchInclude;
  }

  private toAdminMemberView(memberBranch: MemberBranchWithDetails) {
    const lessonBalance = memberBranch.user.lessonBalances.find(
      (balance) => balance.branchId === memberBranch.branchId
    );

    return {
      id: memberBranch.userId,
      branchId: memberBranch.branchId,
      branchName: memberBranch.branch.name,
      displayName: memberBranch.user.displayName,
      phone: memberBranch.user.phone,
      memberNo: memberBranch.memberNo,
      status: memberBranch.status,
      joinedAt: memberBranch.joinedAt,
      lessonBalance: { remaining: lessonBalance?.remaining ?? 0 },
      wechatBound: memberBranch.user.wechatAccounts.length > 0
    };
  }

  private toLessonBalanceAdjustmentView(adjustment: LessonBalanceAdjustmentRecord) {
    return {
      id: adjustment.id,
      gymId: adjustment.gymId,
      branchId: adjustment.branchId,
      userId: adjustment.userId,
      adminId: adjustment.adminId,
      delta: adjustment.delta,
      beforeRemaining: adjustment.beforeRemaining,
      afterRemaining: adjustment.afterRemaining,
      reason: adjustment.reason,
      createdAt: adjustment.createdAt
    };
  }

  private toLessonLedgerAdjustmentEntry(adjustment: LessonBalanceAdjustmentWithAdmin) {
    return {
      id: adjustment.id,
      type: 'ADJUSTMENT',
      branchId: adjustment.branchId,
      userId: adjustment.userId,
      adminId: adjustment.adminId,
      delta: adjustment.delta,
      beforeRemaining: adjustment.beforeRemaining,
      afterRemaining: adjustment.afterRemaining,
      reason: adjustment.reason,
      createdAt: adjustment.createdAt,
      admin: {
        id: adjustment.admin.id,
        displayName: adjustment.admin.displayName
      },
      boxingClass: null
    };
  }

  private toLessonLedgerDeductionEntry(deduction: LessonDeductionLedgerRecord) {
    return {
      id: deduction.id,
      type: 'DEDUCTION',
      branchId: deduction.branchId,
      userId: deduction.userId,
      adminId: deduction.adminId,
      bookingId: deduction.bookingId,
      delta: -deduction.amount,
      beforeRemaining: null,
      afterRemaining: null,
      reason: deduction.note || '到店消课',
      createdAt: deduction.createdAt,
      admin: {
        id: deduction.admin.id,
        displayName: deduction.admin.displayName
      },
      boxingClass: {
        id: deduction.booking.boxingClass.id,
        title: deduction.booking.boxingClass.title,
        coach: deduction.booking.boxingClass.coachNameSnapshot,
        startsAt: deduction.booking.boxingClass.startsAt
      }
    };
  }

  private resolveWechatAppId(appId?: string) {
    return appId?.trim() || this.config.get<string>('MINIAPP_APP_ID') || 'touristappid';
  }
}

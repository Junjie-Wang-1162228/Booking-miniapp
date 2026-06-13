import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StaffRole, UserRole, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BranchAccessService } from '../branches/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminCoachQueryDto, CreateCoachDto, UpdateCoachDto } from './dto';

type CoachAssignmentWithDetails = Prisma.StaffBranchAssignmentGetPayload<{
  include: {
    branch: true;
    user: true;
  };
}>;

@Injectable()
export class CoachesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async listAdminCoaches(adminId: string, query: AdminCoachQueryDto) {
    const branchScope = await this.branchAccess.resolveAdminBranchRoleScope(adminId, query.branchId);
    const where = this.buildCoachAssignmentWhere(
      adminId,
      branchScope.managementBranchIds,
      branchScope.coachOnlyBranchIds
    );
    const andFilters: Prisma.StaffBranchAssignmentWhereInput[] = [];

    if (query.q) {
      andFilters.push({
        OR: [
          { user: { displayName: { contains: query.q } } },
          { user: { nickname: { contains: query.q } } },
          { user: { phone: { contains: query.q } } },
          { user: { username: { contains: query.q } } },
          { branch: { name: { contains: query.q } } }
        ]
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const assignments = await this.prisma.staffBranchAssignment.findMany({
      where,
      include: { branch: true, user: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    });

    return assignments.map((assignment) => this.toAdminCoachView(assignment));
  }

  async createAdminCoach(adminId: string, dto: CreateCoachDto) {
    const branch = await this.branchAccess.ensureBranchExists(dto.branchId);
    await this.branchAccess.ensureAdminBranchRole(adminId, branch.id, [StaffRole.OWNER, StaffRole.MANAGER]);

    const username = dto.username.trim();
    const phone = dto.phone?.trim() || null;
    await this.ensureUsernameAvailable(username);
    if (phone) {
      await this.ensurePhoneAvailable(phone);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const assignment = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: UserRole.ADMIN,
          displayName: dto.displayName.trim(),
          nickname: dto.nickname.trim(),
          username,
          passwordHash,
          phone
        }
      });

      return tx.staffBranchAssignment.create({
        data: {
          gymId: branch.gymId,
          branchId: branch.id,
          userId: user.id,
          role: StaffRole.COACH,
          startsAt: new Date()
        },
        include: { branch: true, user: true }
      });
    });

    await this.auditLogs.record({
      gymId: branch.gymId,
      branchId: branch.id,
      adminId,
      action: 'COACH_CREATE',
      entityType: 'User',
      entityId: assignment.userId,
      message: `创建教练：${assignment.user.displayName}`,
      metadata: {
        username,
        nickname: assignment.user.nickname,
        hasPhone: Boolean(phone)
      }
    });

    return this.toAdminCoachView(assignment);
  }

  async updateAdminCoach(adminId: string, coachId: string, dto: UpdateCoachDto) {
    const existing = await this.findCoachAssignment(coachId, dto.branchId);
    await this.branchAccess.ensureAdminBranchRole(adminId, existing.branchId, [
      StaffRole.OWNER,
      StaffRole.MANAGER
    ]);

    const userData: Prisma.UserUpdateInput = {};
    const assignmentData: Prisma.StaffBranchAssignmentUpdateInput = {};
    const updatedFields: string[] = [];

    if (dto.displayName !== undefined) {
      userData.displayName = dto.displayName.trim();
      updatedFields.push('displayName');
    }

    if (dto.nickname !== undefined) {
      userData.nickname = dto.nickname.trim();
      updatedFields.push('nickname');
    }

    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      await this.ensurePhoneAvailable(phone, coachId);
      userData.phone = phone;
      updatedFields.push('phone');
    }

    if (dto.status !== undefined) {
      assignmentData.status = dto.status as UserStatus;
      assignmentData.endsAt = dto.status === 'DISABLED' ? new Date() : null;
      updatedFields.push('status');
    }

    if (updatedFields.length === 0) {
      throw new BadRequestException('No coach details to update');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({
          where: { id: coachId },
          data: userData
        });
      }

      if (Object.keys(assignmentData).length > 0) {
        return tx.staffBranchAssignment.update({
          where: { id: existing.id },
          data: assignmentData,
          include: { branch: true, user: true }
        });
      }

      return tx.staffBranchAssignment.findUniqueOrThrow({
        where: { id: existing.id },
        include: { branch: true, user: true }
      });
    });

    await this.auditLogs.record({
      gymId: updated.gymId,
      branchId: updated.branchId,
      adminId,
      action: 'COACH_UPDATE',
      entityType: 'User',
      entityId: coachId,
      message: `更新教练：${updated.user.displayName}`,
      metadata: {
        updatedFields
      }
    });

    return this.toAdminCoachView(updated);
  }

  private buildCoachAssignmentWhere(
    adminId: string,
    managementBranchIds: string[],
    coachOnlyBranchIds: string[]
  ): Prisma.StaffBranchAssignmentWhereInput {
    const accessFilters: Prisma.StaffBranchAssignmentWhereInput[] = [];

    if (managementBranchIds.length > 0) {
      accessFilters.push({ branchId: { in: managementBranchIds }, role: StaffRole.COACH });
    }

    if (coachOnlyBranchIds.length > 0) {
      accessFilters.push({
        branchId: { in: coachOnlyBranchIds },
        role: StaffRole.COACH,
        userId: adminId
      });
    }

    return accessFilters.length === 1 ? accessFilters[0] : { OR: accessFilters };
  }

  private async findCoachAssignment(coachId: string, branchId: string) {
    const assignment = await this.prisma.staffBranchAssignment.findFirst({
      where: { userId: coachId, branchId, role: StaffRole.COACH },
      include: { branch: true, user: true }
    });

    if (!assignment) {
      throw new NotFoundException('Coach not found');
    }

    return assignment;
  }

  private async ensureUsernameAvailable(username: string) {
    const existing = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true }
    });

    if (existing) {
      throw new ConflictException('Coach username already exists');
    }
  }

  private async ensurePhoneAvailable(phone: string, currentUserId?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true }
    });

    if (existing && existing.id !== currentUserId) {
      throw new ConflictException('Coach phone already exists');
    }
  }

  private toAdminCoachView(assignment: CoachAssignmentWithDetails) {
    return {
      id: assignment.user.id,
      staffAssignmentId: assignment.id,
      gymId: assignment.gymId,
      branchId: assignment.branchId,
      branchName: assignment.branch.name,
      displayName: assignment.user.displayName,
      nickname: assignment.user.nickname,
      username: assignment.user.username,
      phone: assignment.user.phone,
      status: assignment.status,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt
    };
  }
}

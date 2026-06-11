import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBranchScope } from './branch-scope.types';
import { toAdminBranchView, toMemberBranchView } from './branch-view.mapper';

@Injectable()
export class BranchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async listMemberBranches(userId: string) {
    const memberBranches = await this.prisma.memberBranch.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { branch: true },
      orderBy: [{ isDefault: 'desc' }, { joinedAt: 'asc' }]
    });

    return Promise.all(
      memberBranches.map(async (memberBranch) => {
        const lessonBalance = await this.prisma.lessonBalance.findUnique({
          where: { userId_branchId: { userId, branchId: memberBranch.branchId } }
        });

        return toMemberBranchView({
          isDefault: memberBranch.isDefault,
          branch: memberBranch.branch,
          lessonBalance
        });
      })
    );
  }

  async listAdminBranches(userId: string) {
    const assignments = await this.prisma.staffBranchAssignment.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { branch: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
    });

    return assignments.map((assignment) =>
      toAdminBranchView({ role: assignment.role, branch: assignment.branch })
    );
  }

  async ensureMemberBranchAccess(userId: string, branchId: string) {
    const memberBranch = await this.prisma.memberBranch.findUnique({
      where: { userId_branchId: { userId, branchId } }
    });

    if (!memberBranch || memberBranch.status !== 'ACTIVE') {
      throw new ForbiddenException('Member cannot access this branch');
    }

    return memberBranch;
  }

  async resolveAdminBranchScope(userId: string, requestedBranchId?: string): Promise<AdminBranchScope> {
    const assignments = await this.prisma.staffBranchAssignment.findMany({
      where: { userId, status: 'ACTIVE' }
    });
    const isOwner = assignments.some((assignment) => assignment.role === StaffRole.OWNER);
    const branchIds = assignments.map((assignment) => assignment.branchId);

    if (branchIds.length === 0) {
      throw new ForbiddenException('Admin has no branch access');
    }

    if (requestedBranchId && !isOwner && !branchIds.includes(requestedBranchId)) {
      throw new ForbiddenException('Admin cannot access this branch');
    }

    return { isOwner, branchIds: requestedBranchId ? [requestedBranchId] : branchIds };
  }

  async ensureAdminBranchRole(userId: string, branchId: string, allowedRoles: StaffRole[]) {
    const assignment = await this.prisma.staffBranchAssignment.findFirst({
      where: { userId, branchId, status: 'ACTIVE', role: { in: allowedRoles } }
    });

    if (!assignment) {
      throw new ForbiddenException('Admin cannot manage this branch');
    }

    return assignment;
  }

  async getDefaultBranch() {
    const branch = await this.prisma.branch.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' }
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async ensureBranchExists(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }
}

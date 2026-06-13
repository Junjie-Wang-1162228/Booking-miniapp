import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchAccessService } from '../branches/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditLogQueryDto } from './dto';

export type AuditAction =
  | 'CLASS_CREATE'
  | 'CLASS_UPDATE'
  | 'CLASS_CANCEL'
  | 'BOOKING_CANCEL'
  | 'LESSON_DEDUCT'
  | 'LESSON_ADJUST'
  | 'NOTIFICATION_RETRY'
  | 'MEMBER_CREATE'
  | 'WECHAT_BIND'
  | 'WECHAT_UNBIND'
  | 'MEMBER_UPDATE'
  | 'COACH_CREATE'
  | 'COACH_UPDATE';

type RecordAuditLogInput = {
  gymId: string;
  branchId: string;
  adminId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService
  ) {}

  async record(input: RecordAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        gymId: input.gymId,
        branchId: input.branchId,
        adminId: input.adminId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        message: this.truncateMessage(input.message),
        metadata: input.metadata
      }
    });
  }

  async listAdminAuditLogs(adminId: string, query: AdminAuditLogQueryDto) {
    const branchScope = await this.branchAccess.resolveAdminBranchScope(adminId, query.branchId);
    const where: Prisma.AuditLogWhereInput = {
      branchId: { in: branchScope.branchIds }
    };
    const andFilters: Prisma.AuditLogWhereInput[] = [];

    if (query.action) {
      where.action = query.action;
    }

    if (query.q) {
      andFilters.push({
        OR: [
          { message: { contains: query.q } },
          { entityType: { contains: query.q } },
          { entityId: { contains: query.q } },
          { admin: { displayName: { contains: query.q } } },
          { branch: { name: { contains: query.q } } }
        ]
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        admin: { select: { id: true, displayName: true } },
        branch: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    return logs.map((log) => ({
      id: log.id,
      gymId: log.gymId,
      branchId: log.branchId,
      branchName: log.branch.name,
      adminId: log.adminId,
      admin: log.admin,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      message: log.message,
      metadata: log.metadata,
      createdAt: log.createdAt
    }));
  }

  private truncateMessage(value: string) {
    return value.length > 500 ? value.slice(0, 500) : value;
  }
}

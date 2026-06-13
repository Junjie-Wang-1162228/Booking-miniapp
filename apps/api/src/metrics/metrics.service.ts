import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, ClassStatus, Prisma } from '@prisma/client';
import { BranchAccessService } from '../branches/branch-access.service';
import { businessDayUtcRange, resolveBusinessTimezoneOffsetMinutes } from '../lesson-deductions/business-day';
import { PrismaService } from '../prisma/prisma.service';
import { AdminDailyMetricsQueryDto } from './dto';

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly config: ConfigService
  ) {}

  async getAdminDailyMetrics(adminId: string, query: AdminDailyMetricsQueryDto) {
    const offsetMinutes = resolveBusinessTimezoneOffsetMinutes(this.config);
    const date = query.date ?? formatBusinessDate(new Date(), offsetMinutes);
    const range = businessDayUtcRange(date, offsetMinutes);

    if (!range) {
      throw new BadRequestException('date must use YYYY-MM-DD');
    }

    const branchScope = await this.branchAccess.resolveAdminBranchRoleScope(adminId, query.branchId);
    const bookingAccessWhere = this.buildAdminBookingWhere(
      adminId,
      branchScope.managementBranchIds,
      branchScope.coachOnlyBranchIds
    );
    const deductionAccessWhere = this.buildAdminDeductionWhere(
      adminId,
      branchScope.managementBranchIds,
      branchScope.coachOnlyBranchIds
    );
    const classAccessWhere = this.buildAdminClassWhere(
      adminId,
      branchScope.managementBranchIds,
      branchScope.coachOnlyBranchIds
    );

    const [bookingCreatedCount, bookingCanceledCount, lessonDeductedCount, dailyClasses] = await Promise.all([
      this.prisma.booking.count({
        where: {
          AND: [bookingAccessWhere, { createdAt: { gte: range.start, lt: range.end } }]
        }
      }),
      this.prisma.booking.count({
        where: {
          AND: [bookingAccessWhere, { canceledAt: { gte: range.start, lt: range.end } }]
        }
      }),
      this.prisma.lessonDeduction.count({
        where: {
          AND: [deductionAccessWhere, { createdAt: { gte: range.start, lt: range.end } }]
        }
      }),
      this.prisma.boxingClass.findMany({
        where: {
          AND: [
            classAccessWhere,
            {
              status: ClassStatus.SCHEDULED,
              startsAt: { gte: range.start, lt: range.end }
            }
          ]
        },
        select: {
          id: true,
          capacity: true,
          bookings: {
            where: { status: BookingStatus.BOOKED },
            select: { id: true }
          }
        }
      })
    ]);

    const fullClassCount = dailyClasses.filter((boxingClass) => boxingClass.bookings.length >= boxingClass.capacity)
      .length;

    return {
      date,
      branchIds: branchScope.branchIds,
      bookingCreatedCount,
      bookingCanceledCount,
      lessonDeductedCount,
      fullClassCount
    };
  }

  private buildAdminBookingWhere(
    adminId: string,
    managementBranchIds: string[],
    coachOnlyBranchIds: string[]
  ): Prisma.BookingWhereInput {
    const accessFilters: Prisma.BookingWhereInput[] = [];

    if (managementBranchIds.length > 0) {
      accessFilters.push({ branchId: { in: managementBranchIds } });
    }

    if (coachOnlyBranchIds.length > 0) {
      accessFilters.push({
        branchId: { in: coachOnlyBranchIds },
        boxingClass: { coachId: adminId }
      });
    }

    return accessFilters.length === 1 ? accessFilters[0] : { OR: accessFilters };
  }

  private buildAdminDeductionWhere(
    adminId: string,
    managementBranchIds: string[],
    coachOnlyBranchIds: string[]
  ): Prisma.LessonDeductionWhereInput {
    const accessFilters: Prisma.LessonDeductionWhereInput[] = [];

    if (managementBranchIds.length > 0) {
      accessFilters.push({ branchId: { in: managementBranchIds } });
    }

    if (coachOnlyBranchIds.length > 0) {
      accessFilters.push({
        branchId: { in: coachOnlyBranchIds },
        booking: { boxingClass: { coachId: adminId } }
      });
    }

    return accessFilters.length === 1 ? accessFilters[0] : { OR: accessFilters };
  }

  private buildAdminClassWhere(
    adminId: string,
    managementBranchIds: string[],
    coachOnlyBranchIds: string[]
  ): Prisma.BoxingClassWhereInput {
    const accessFilters: Prisma.BoxingClassWhereInput[] = [];

    if (managementBranchIds.length > 0) {
      accessFilters.push({ branchId: { in: managementBranchIds } });
    }

    if (coachOnlyBranchIds.length > 0) {
      accessFilters.push({ branchId: { in: coachOnlyBranchIds }, coachId: adminId });
    }

    return accessFilters.length === 1 ? accessFilters[0] : { OR: accessFilters };
  }
}

function formatBusinessDate(date: Date, offsetMinutes: number) {
  return new Date(date.getTime() + offsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

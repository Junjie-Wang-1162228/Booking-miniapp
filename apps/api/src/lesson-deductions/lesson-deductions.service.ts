import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceStatus, BookingStatus, NotificationStatus, Prisma, StaffRole } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BranchAccessService } from '../branches/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { businessDayUtcRange, resolveBusinessTimezoneOffsetMinutes } from './business-day';
import { AdminBookingQueryDto, AdminCancelBookingDto, DeductLessonDto } from './dto';

type AdminBookingWithRelations = Prisma.BookingGetPayload<{
  include: {
    user: true;
    boxingClass: true;
    lessonDeduction: true;
  };
}>;

@Injectable()
export class LessonDeductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async listAdminBookings(adminId: string, query: AdminBookingQueryDto) {
    const branchScope = await this.branchAccess.resolveAdminBranchRoleScope(adminId, query.branchId);
    const where = this.buildAdminBookingWhere(
      adminId,
      branchScope.managementBranchIds,
      branchScope.coachOnlyBranchIds
    );
    const andFilters: Prisma.BookingWhereInput[] = [];

    if (query.status === 'BOOKED' || query.status === 'CANCELED') {
      where.status = query.status;
    }

    if (query.date) {
      const range = businessDayUtcRange(query.date, resolveBusinessTimezoneOffsetMinutes(this.config));
      if (!range) {
        throw new BadRequestException('date must use YYYY-MM-DD');
      }
      andFilters.push({ boxingClass: { startsAt: { gte: range.start, lt: range.end } } });
    }

    if (query.q) {
      andFilters.push({
        OR: [
          { user: { displayName: { contains: query.q } } },
          { user: { phone: { contains: query.q } } },
          { boxingClass: { title: { contains: query.q } } }
        ]
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        user: true,
        boxingClass: true,
        lessonDeduction: true
      },
      orderBy: { boxingClass: { startsAt: 'asc' } }
    });

    return bookings.map((booking) => this.toAdminBookingView(booking));
  }

  async cancelAdminBooking(adminId: string, bookingId: string, dto: AdminCancelBookingDto) {
    const reason = dto.reason?.trim();
    const canceled = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          user: true,
          boxingClass: true,
          lessonDeduction: true
        }
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      await this.branchAccess.ensureAdminBranchRole(adminId, booking.branchId, [
        StaffRole.OWNER,
        StaffRole.MANAGER
      ]);

      if (booking.status !== BookingStatus.BOOKED) {
        throw new BadRequestException('Booking is not active');
      }

      if (booking.lessonDeduction || booking.attendanceStatus === AttendanceStatus.ATTENDED) {
        throw new BadRequestException('Cannot cancel a deducted booking');
      }

      const now = new Date();
      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELED,
          canceledAt: now,
          attendanceStatus: AttendanceStatus.PENDING
        },
        include: {
          user: true,
          boxingClass: true,
          lessonDeduction: true
        }
      });

      await tx.notificationJob.updateMany({
        where: { bookingId: booking.id, status: NotificationStatus.PENDING },
        data: { status: NotificationStatus.SKIPPED }
      });

      return updated;
    });

    await this.auditLogs.record({
      gymId: canceled.gymId,
      branchId: canceled.branchId,
      adminId,
      action: 'BOOKING_CANCEL',
      entityType: 'Booking',
      entityId: canceled.id,
      message: `取消预约：${canceled.user.displayName} / ${canceled.boxingClass.title}`,
      metadata: {
        memberId: canceled.userId,
        classId: canceled.classId,
        canceledBy: 'admin',
        ...(reason ? { reason } : {})
      }
    });

    return this.toAdminBookingView(canceled);
  }

  async deductLesson(adminId: string, bookingId: string, dto: DeductLessonDto) {
    const deduction = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          user: true,
          boxingClass: true,
          lessonDeduction: true
        }
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.status === BookingStatus.CANCELED) {
        throw new BadRequestException('Cannot deduct a canceled booking');
      }

      if (booking.lessonDeduction) {
        throw new ConflictException('Booking has already been deducted');
      }

      await this.branchAccess.ensureAdminBranchRole(adminId, booking.branchId, [
        StaffRole.OWNER,
        StaffRole.MANAGER
      ]);

      const lessonBalance = await tx.lessonBalance.findUnique({
        where: { userId_branchId: { userId: booking.userId, branchId: booking.branchId } }
      });

      if (!lessonBalance || lessonBalance.remaining <= 0) {
        throw new ConflictException('Member has no remaining lessons');
      }

      const deduction = await tx.lessonDeduction.create({
        data: {
          gymId: booking.gymId,
          branchId: booking.branchId,
          bookingId: booking.id,
          userId: booking.userId,
          adminId,
          amount: 1,
          note: dto.note
        },
        include: {
          user: true,
          admin: true,
          booking: { include: { boxingClass: true } }
        }
      });

      await tx.lessonBalance.update({
        where: { userId_branchId: { userId: booking.userId, branchId: booking.branchId } },
        data: { remaining: { decrement: 1 } }
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: { attendanceStatus: AttendanceStatus.ATTENDED }
      });

      return this.toDeductionView(deduction);
    });

    await this.auditLogs.record({
      gymId: deduction.gymId,
      branchId: deduction.branchId,
      adminId,
      action: 'LESSON_DEDUCT',
      entityType: 'Booking',
      entityId: deduction.bookingId,
      message: `消课：${deduction.member.displayName} / ${deduction.boxingClass.title}`,
      metadata: {
        deductionId: deduction.id,
        memberId: deduction.userId,
        amount: deduction.amount,
        note: deduction.note
      }
    });

    return deduction;
  }

  private toAdminBookingView(booking: AdminBookingWithRelations) {
    return {
      id: booking.id,
      gymId: booking.gymId,
      branchId: booking.branchId,
      status: booking.status,
      attendanceStatus: booking.attendanceStatus,
      deductionId: booking.lessonDeduction?.id ?? null,
      createdAt: booking.createdAt,
      canceledAt: booking.canceledAt,
      member: {
        id: booking.user.id,
        displayName: booking.user.displayName,
        phone: booking.user.phone
      },
      boxingClass: {
        id: booking.boxingClass.id,
        title: booking.boxingClass.title,
        coach: booking.boxingClass.coachNameSnapshot,
        branchId: booking.branchId,
        coachId: booking.boxingClass.coachId,
        startsAt: booking.boxingClass.startsAt,
        durationMin: booking.boxingClass.durationMin,
        status: booking.boxingClass.status
      }
    };
  }

  async listMine(userId: string, branchId: string) {
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }

    await this.branchAccess.ensureMemberBranchAccess(userId, branchId);

    const deductions = await this.prisma.lessonDeduction.findMany({
      where: { userId, branchId },
      include: {
        user: true,
        admin: true,
        booking: { include: { boxingClass: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return deductions.map((deduction) => this.toDeductionView(deduction));
  }

  async listAdminDeductions(adminId: string, branchId?: string) {
    const branchScope = await this.branchAccess.resolveAdminBranchRoleScope(adminId, branchId);
    const deductions = await this.prisma.lessonDeduction.findMany({
      where: this.buildAdminDeductionWhere(
        adminId,
        branchScope.managementBranchIds,
        branchScope.coachOnlyBranchIds
      ),
      include: {
        user: true,
        admin: true,
        booking: { include: { boxingClass: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return deductions.map((deduction) => this.toDeductionView(deduction));
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

  private toDeductionView(
    deduction: Prisma.LessonDeductionGetPayload<{
      include: {
        user: true;
        admin: true;
        booking: { include: { boxingClass: true } };
      };
    }>
  ) {
    return {
      id: deduction.id,
      gymId: deduction.gymId,
      branchId: deduction.branchId,
      bookingId: deduction.bookingId,
      userId: deduction.userId,
      adminId: deduction.adminId,
      amount: deduction.amount,
      note: deduction.note,
      createdAt: deduction.createdAt,
      member: {
        id: deduction.user.id,
        displayName: deduction.user.displayName,
        phone: deduction.user.phone
      },
      admin: {
        id: deduction.admin.id,
        displayName: deduction.admin.displayName
      },
      boxingClass: {
        id: deduction.booking.boxingClass.id,
        title: deduction.booking.boxingClass.title,
        coach: deduction.booking.boxingClass.coachNameSnapshot,
        branchId: deduction.branchId,
        startsAt: deduction.booking.boxingClass.startsAt
      }
    };
  }
}

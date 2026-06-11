import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { AttendanceStatus, BookingStatus, Prisma, StaffRole } from '@prisma/client';
import { BranchAccessService } from '../branches/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBookingQueryDto, DeductLessonDto } from './dto';

@Injectable()
export class LessonDeductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService
  ) {}

  async listAdminBookings(adminId: string, query: AdminBookingQueryDto) {
    const branchScope = await this.branchAccess.resolveAdminBranchScope(adminId, query.branchId);
    const where: Prisma.BookingWhereInput = {
      branchId: { in: branchScope.branchIds }
    };
    const andFilters: Prisma.BookingWhereInput[] = [];

    if (query.status === 'BOOKED' || query.status === 'CANCELED') {
      where.status = query.status;
    }

    if (query.date) {
      const start = new Date(`${query.date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      andFilters.push({ boxingClass: { startsAt: { gte: start, lt: end } } });
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

    return bookings.map((booking) => ({
      id: booking.id,
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
        startsAt: booking.boxingClass.startsAt,
        durationMin: booking.boxingClass.durationMin,
        status: booking.boxingClass.status
      }
    }));
  }

  async deductLesson(adminId: string, bookingId: string, dto: DeductLessonDto) {
    return this.prisma.$transaction(async (tx) => {
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
    const branchScope = await this.branchAccess.resolveAdminBranchScope(adminId, branchId);
    const deductions = await this.prisma.lessonDeduction.findMany({
      where: { branchId: { in: branchScope.branchIds } },
      include: {
        user: true,
        admin: true,
        booking: { include: { boxingClass: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return deductions.map((deduction) => this.toDeductionView(deduction));
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

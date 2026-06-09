import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { AttendanceStatus, BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBookingQueryDto, DeductLessonDto } from './dto';

@Injectable()
export class LessonDeductionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdminBookings(query: AdminBookingQueryDto) {
    const where: Prisma.BookingWhereInput = {};

    if (query.status === 'BOOKED' || query.status === 'CANCELED') {
      where.status = query.status;
    }

    if (query.date) {
      const start = new Date(`${query.date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.boxingClass = { startsAt: { gte: start, lt: end } };
    }

    if (query.q) {
      where.OR = [
        { user: { displayName: { contains: query.q } } },
        { user: { phone: { contains: query.q } } },
        { boxingClass: { title: { contains: query.q } } }
      ];
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
        coach: booking.boxingClass.coach,
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
          user: { include: { lessonBalance: true } },
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

      if (!booking.user.lessonBalance || booking.user.lessonBalance.remaining <= 0) {
        throw new ConflictException('Member has no remaining lessons');
      }

      const deduction = await tx.lessonDeduction.create({
        data: {
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
        where: { userId: booking.userId },
        data: { remaining: { decrement: 1 } }
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: { attendanceStatus: AttendanceStatus.ATTENDED }
      });

      return this.toDeductionView(deduction);
    });
  }

  async listMine(userId: string) {
    const deductions = await this.prisma.lessonDeduction.findMany({
      where: { userId },
      include: {
        user: true,
        admin: true,
        booking: { include: { boxingClass: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return deductions.map((deduction) => this.toDeductionView(deduction));
  }

  async listAdminDeductions() {
    const deductions = await this.prisma.lessonDeduction.findMany({
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
        coach: deduction.booking.boxingClass.coach,
        startsAt: deduction.booking.boxingClass.startsAt
      }
    };
  }
}

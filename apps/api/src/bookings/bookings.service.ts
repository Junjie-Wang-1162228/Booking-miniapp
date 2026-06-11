import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { AttendanceStatus, Booking, BookingStatus, ClassStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { BranchAccessService } from '../branches/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto';

type BookingWithClass = Booking & {
  boxingClass: {
    id: string;
    title: string;
    coachNameSnapshot: string;
    branchId: string;
    coachId: string | null;
    startsAt: Date;
    durationMin: number;
    status: ClassStatus;
    description: string;
  };
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly branchAccess: BranchAccessService
  ) {}

  async listMine(userId: string, branchId: string) {
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }

    await this.branchAccess.ensureMemberBranchAccess(userId, branchId);

    const bookings = await this.prisma.booking.findMany({
      where: { userId, branchId },
      include: { boxingClass: true },
      orderBy: { createdAt: 'desc' }
    });

    return bookings.map((booking) => this.toBookingView(booking));
  }

  async createBooking(userId: string, dto: CreateBookingDto) {
    await this.branchAccess.ensureMemberBranchAccess(userId, dto.branchId);

    return this.prisma.$transaction(async (tx) => {
      const boxingClass = await tx.boxingClass.findUnique({
        where: { id: dto.classId },
        include: {
          bookings: {
            where: { status: BookingStatus.BOOKED },
            select: { id: true, userId: true }
          }
        }
      });

      if (!boxingClass) {
        throw new NotFoundException('Class not found');
      }

      if (boxingClass.branchId !== dto.branchId) {
        throw new BadRequestException('Class does not belong to requested branch');
      }

      const lessonBalance = await tx.lessonBalance.findUnique({
        where: { userId_branchId: { userId, branchId: dto.branchId } }
      });

      if (!lessonBalance || lessonBalance.remaining <= 0) {
        throw new ConflictException('Member has no remaining lessons');
      }

      if (boxingClass.status !== ClassStatus.SCHEDULED) {
        throw new BadRequestException('Class is not available for booking');
      }

      if (boxingClass.startsAt <= new Date()) {
        throw new BadRequestException('Class has already started');
      }

      const duplicate = boxingClass.bookings.some((booking) => booking.userId === userId);
      if (duplicate) {
        throw new ConflictException('You already booked this class');
      }

      if (boxingClass.bookings.length >= boxingClass.capacity) {
        throw new ConflictException('Class is full');
      }

      const booking = await tx.booking.create({
        data: {
          gymId: boxingClass.gymId,
          branchId: boxingClass.branchId,
          userId,
          classId: boxingClass.id
        },
        include: { boxingClass: true }
      });

      if (dto.remindBeforeMinutes) {
        await this.createClassReminderInTransaction(
          tx,
          booking.id,
          userId,
          boxingClass.gymId,
          boxingClass.branchId,
          boxingClass.startsAt,
          dto.remindBeforeMinutes
        );
      }

      return this.toBookingView(booking);
    });
  }

  async cancelBooking(userId: string, bookingId: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { boxingClass: true }
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.userId !== userId) {
        throw new ForbiddenException('Cannot cancel another member booking');
      }

      await this.branchAccess.ensureMemberBranchAccess(userId, booking.branchId);

      if (booking.status !== BookingStatus.BOOKED) {
        throw new BadRequestException('Booking is not active');
      }

      if (booking.boxingClass.startsAt <= new Date()) {
        throw new BadRequestException('Class has already started');
      }

      const canceled = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELED,
          canceledAt: new Date(),
          attendanceStatus: AttendanceStatus.PENDING
        },
        include: { boxingClass: true }
      });

      await tx.notificationJob.updateMany({
        where: { bookingId: booking.id, status: 'PENDING' },
        data: { status: 'SKIPPED' }
      });

      return this.toBookingView(canceled);
    });
  }

  private async createClassReminderInTransaction(
    tx: Prisma.TransactionClient,
    bookingId: string,
    userId: string,
    gymId: string,
    branchId: string,
    classStartsAt: Date,
    remindBeforeMinutes: number
  ) {
    await tx.notificationJob.create({
      data: {
        gymId,
        branchId,
        bookingId,
        userId,
        type: 'CLASS_REMINDER',
        scheduledAt: new Date(classStartsAt.getTime() - remindBeforeMinutes * 60 * 1000),
        templateId: this.config.get<string>('WECHAT_SUBSCRIBE_TEMPLATE_ID') || null
      }
    });
  }

  private toBookingView(booking: BookingWithClass) {
    return {
      id: booking.id,
      gymId: booking.gymId,
      branchId: booking.branchId,
      status: booking.status,
      attendanceStatus: booking.attendanceStatus,
      canceledAt: booking.canceledAt,
      createdAt: booking.createdAt,
      canCancel: booking.status === BookingStatus.BOOKED && booking.boxingClass.startsAt > new Date(),
      boxingClass: {
        id: booking.boxingClass.id,
        title: booking.boxingClass.title,
        coach: booking.boxingClass.coachNameSnapshot,
        branchId: booking.boxingClass.branchId,
        coachId: booking.boxingClass.coachId,
        startsAt: booking.boxingClass.startsAt,
        durationMin: booking.boxingClass.durationMin,
        status: booking.boxingClass.status,
        description: booking.boxingClass.description
      }
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttendanceStatus,
  BoxingClass,
  BookingStatus,
  ClassStatus,
  NotificationStatus,
  Prisma,
  StaffRole
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BranchAccessService } from '../branches/branch-access.service';
import {
  CLASS_CANCELED_NOTIFICATION_TYPE,
  CLASS_REMINDER_NOTIFICATION_TYPE,
  CLASS_RESCHEDULED_NOTIFICATION_TYPE
} from '../notifications/notification-types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto, UpdateClassDto } from './dto';

type ClassWithBookings = BoxingClass & {
  bookings: { id: string; userId: string }[];
  branch?: { name: string } | null;
};

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService
  ) {}

  async listAvailable(userId: string, branchId: string, now = new Date()) {
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }

    await this.branchAccess.ensureMemberBranchAccess(userId, branchId);

    const classes = await this.prisma.boxingClass.findMany({
      where: {
        branchId,
        status: ClassStatus.SCHEDULED,
        startsAt: { gt: now }
      },
      include: {
        branch: { select: { name: true } },
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true, userId: true }
        }
      },
      orderBy: { startsAt: 'asc' }
    });

    return classes.map((boxingClass) => this.toClassView(boxingClass, userId));
  }

  async listAdmin(adminId: string, branchId?: string) {
    const branchScope = await this.branchAccess.resolveAdminBranchRoleScope(adminId, branchId);
    const classes = await this.prisma.boxingClass.findMany({
      where: this.buildAdminClassWhere(adminId, branchScope.managementBranchIds, branchScope.coachOnlyBranchIds),
      include: {
        branch: { select: { name: true } },
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true, userId: true }
        }
      },
      orderBy: { startsAt: 'asc' }
    });

    return classes.map((boxingClass) => this.toClassView(boxingClass));
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

  async create(adminId: string, dto: CreateClassDto) {
    const branch = await this.branchAccess.ensureBranchExists(dto.branchId);
    await this.branchAccess.ensureAdminBranchRole(adminId, branch.id, [StaffRole.OWNER, StaffRole.MANAGER]);
    this.ensureFutureStartTime(dto.startsAt);

    if (dto.coachId) {
      await this.branchAccess.ensureAdminBranchRole(dto.coachId, branch.id, [StaffRole.COACH]);
    }

    const boxingClass = await this.prisma.boxingClass.create({
      data: {
        gymId: branch.gymId,
        branchId: branch.id,
        coachId: dto.coachId,
        title: dto.title,
        coachNameSnapshot: dto.coach,
        startsAt: new Date(dto.startsAt),
        durationMin: dto.durationMin,
        capacity: dto.capacity,
        description: dto.description
      },
      include: {
        branch: { select: { name: true } },
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true, userId: true }
        }
      }
    });

    await this.auditLogs.record({
      gymId: boxingClass.gymId,
      branchId: boxingClass.branchId,
      adminId,
      action: 'CLASS_CREATE',
      entityType: 'BoxingClass',
      entityId: boxingClass.id,
      message: `创建课程：${boxingClass.title}`,
      metadata: {
        title: boxingClass.title,
        coach: boxingClass.coachNameSnapshot,
        startsAt: boxingClass.startsAt.toISOString(),
        durationMin: boxingClass.durationMin,
        capacity: boxingClass.capacity
      }
    });

    return this.toClassView(boxingClass);
  }

  async update(adminId: string, id: string, dto: UpdateClassDto) {
    const existing = await this.ensureExists(id);
    await this.branchAccess.ensureAdminBranchRole(adminId, existing.branchId, [StaffRole.OWNER, StaffRole.MANAGER]);
    const newStartsAt = dto.startsAt !== undefined ? new Date(dto.startsAt) : null;
    const isReschedule = newStartsAt !== null && existing.startsAt.getTime() !== newStartsAt.getTime();

    if (dto.coachId) {
      await this.branchAccess.ensureAdminBranchRole(dto.coachId, existing.branchId, [StaffRole.COACH]);
    }

    if (dto.startsAt !== undefined) {
      this.ensureFutureStartTime(dto.startsAt);
    }

    if (dto.capacity !== undefined) {
      await this.ensureCapacityCanHoldActiveBookings(id, dto.capacity);
    }

    const updateResult = await this.prisma.$transaction(async (tx) => {
      const activeBookings = isReschedule
        ? await tx.booking.findMany({
            where: { classId: id, status: BookingStatus.BOOKED },
            select: { id: true, userId: true }
          })
        : [];
      const activeBookingIds = activeBookings.map((booking) => booking.id);
      let rescheduleNotificationJobCount = 0;
      let reminderJobRescheduledCount = 0;

      const pendingReminders =
        isReschedule && activeBookingIds.length > 0 && newStartsAt
          ? await tx.notificationJob.findMany({
              where: {
                bookingId: { in: activeBookingIds },
                type: CLASS_REMINDER_NOTIFICATION_TYPE,
                status: NotificationStatus.PENDING
              },
              select: { id: true, scheduledAt: true }
            })
          : [];

      const boxingClass = await tx.boxingClass.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.coach !== undefined ? { coachNameSnapshot: dto.coach } : {}),
          ...(dto.coachId !== undefined ? { coachId: dto.coachId } : {}),
          ...(newStartsAt !== null ? { startsAt: newStartsAt } : {}),
          ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {})
        },
        include: {
          branch: { select: { name: true } },
          bookings: {
            where: { status: BookingStatus.BOOKED },
            select: { id: true, userId: true }
          }
        }
      });

      if (isReschedule && activeBookings.length > 0 && newStartsAt) {
        for (const reminder of pendingReminders) {
          const remindBeforeMs = existing.startsAt.getTime() - reminder.scheduledAt.getTime();
          const nextScheduledAt =
            remindBeforeMs > 0 ? new Date(newStartsAt.getTime() - remindBeforeMs) : new Date();
          await tx.notificationJob.update({
            where: { id: reminder.id },
            data: { scheduledAt: nextScheduledAt }
          });
        }
        reminderJobRescheduledCount = pendingReminders.length;

        const createdJobs = await tx.notificationJob.createMany({
          data: activeBookings.map((booking) => ({
            gymId: existing.gymId,
            branchId: existing.branchId,
            bookingId: booking.id,
            userId: booking.userId,
            type: CLASS_RESCHEDULED_NOTIFICATION_TYPE,
            scheduledAt: new Date(),
            templateId:
              this.config.get<string>('WECHAT_CLASS_RESCHEDULED_TEMPLATE_ID') ||
              this.config.get<string>('WECHAT_SUBSCRIBE_TEMPLATE_ID') ||
              null
          }))
        });
        rescheduleNotificationJobCount = createdJobs.count;
      }

      return {
        boxingClass,
        affectedBookingCount: activeBookings.length,
        rescheduleNotificationJobCount,
        reminderJobRescheduledCount
      };
    });
    const {
      boxingClass,
      affectedBookingCount,
      rescheduleNotificationJobCount,
      reminderJobRescheduledCount
    } = updateResult;

    const updatedFields = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    const metadata: Prisma.InputJsonObject = isReschedule
      ? {
          updatedFields,
          previousStartsAt: existing.startsAt.toISOString(),
          newStartsAt: boxingClass.startsAt.toISOString(),
          affectedBookingCount,
          rescheduleNotificationJobCount,
          reminderJobRescheduledCount
        }
      : {
          updatedFields
        };

    await this.auditLogs.record({
      gymId: boxingClass.gymId,
      branchId: boxingClass.branchId,
      adminId,
      action: 'CLASS_UPDATE',
      entityType: 'BoxingClass',
      entityId: boxingClass.id,
      message: `编辑课程：${boxingClass.title}`,
      metadata
    });

    return this.toClassView(boxingClass);
  }

  async cancel(adminId: string, id: string) {
    const existing = await this.ensureExists(id);
    await this.branchAccess.ensureAdminBranchRole(adminId, existing.branchId, [StaffRole.OWNER, StaffRole.MANAGER]);

    const now = new Date();
    const cancellation = await this.prisma.$transaction(async (tx) => {
      const activeBookings = await tx.booking.findMany({
        where: { classId: id, status: BookingStatus.BOOKED },
        select: { id: true, userId: true }
      });
      const activeBookingIds = activeBookings.map((booking) => booking.id);
      let notificationJobCount = 0;

      await tx.boxingClass.update({
        where: { id },
        data: { status: ClassStatus.CANCELED }
      });

      if (activeBookingIds.length > 0) {
        await tx.booking.updateMany({
          where: { id: { in: activeBookingIds } },
          data: {
            status: BookingStatus.CANCELED,
            attendanceStatus: AttendanceStatus.PENDING,
            canceledAt: now
          }
        });

        await tx.notificationJob.updateMany({
          where: {
            bookingId: { in: activeBookingIds },
            status: NotificationStatus.PENDING,
            type: CLASS_REMINDER_NOTIFICATION_TYPE
          },
          data: { status: NotificationStatus.SKIPPED }
        });

        const createdJobs = await tx.notificationJob.createMany({
          data: activeBookings.map((booking) => ({
            gymId: existing.gymId,
            branchId: existing.branchId,
            bookingId: booking.id,
            userId: booking.userId,
            type: CLASS_CANCELED_NOTIFICATION_TYPE,
            scheduledAt: now,
            templateId:
              this.config.get<string>('WECHAT_CLASS_CANCELED_TEMPLATE_ID') ||
              this.config.get<string>('WECHAT_SUBSCRIBE_TEMPLATE_ID') ||
              null
          }))
        });
        notificationJobCount = createdJobs.count;
      }

      const boxingClass = await tx.boxingClass.findUniqueOrThrow({
        where: { id },
        include: {
          branch: { select: { name: true } },
          bookings: {
            where: { status: BookingStatus.BOOKED },
            select: { id: true, userId: true }
          }
        }
      });

      return {
        boxingClass,
        affectedBookingCount: activeBookingIds.length,
        notificationJobCount
      };
    });
    const { boxingClass, affectedBookingCount, notificationJobCount } = cancellation;

    await this.auditLogs.record({
      gymId: boxingClass.gymId,
      branchId: boxingClass.branchId,
      adminId,
      action: 'CLASS_CANCEL',
      entityType: 'BoxingClass',
      entityId: boxingClass.id,
      message: `取消课程：${boxingClass.title}`,
      metadata: {
        title: boxingClass.title,
        startsAt: boxingClass.startsAt.toISOString(),
        status: boxingClass.status,
        affectedBookingCount,
        notificationJobCount
      }
    });

    return this.toClassView(boxingClass);
  }

  private async ensureExists(id: string) {
    const existing = await this.prisma.boxingClass.findUnique({
      where: { id },
      select: { id: true, gymId: true, branchId: true, startsAt: true }
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }
    return existing;
  }

  private ensureFutureStartTime(startsAt: string) {
    if (new Date(startsAt) <= new Date()) {
      throw new BadRequestException('Class start time must be in the future');
    }
  }

  private async ensureCapacityCanHoldActiveBookings(classId: string, capacity: number) {
    const activeBookingCount = await this.prisma.booking.count({
      where: { classId, status: BookingStatus.BOOKED }
    });

    if (capacity < activeBookingCount) {
      throw new BadRequestException('Class capacity cannot be lower than active bookings');
    }
  }

  private toClassView(boxingClass: ClassWithBookings, currentUserId?: string) {
    const bookedCount = boxingClass.bookings.length;

    return {
      id: boxingClass.id,
      gymId: boxingClass.gymId,
      branchId: boxingClass.branchId,
      branchName: boxingClass.branch?.name ?? null,
      title: boxingClass.title,
      coach: boxingClass.coachNameSnapshot,
      coachId: boxingClass.coachId,
      startsAt: boxingClass.startsAt,
      durationMin: boxingClass.durationMin,
      capacity: boxingClass.capacity,
      remainingSpots: Math.max(boxingClass.capacity - bookedCount, 0),
      bookedCount,
      isBookedByMe: currentUserId ? boxingClass.bookings.some((booking) => booking.userId === currentUserId) : false,
      status: boxingClass.status,
      description: boxingClass.description
    };
  }
}

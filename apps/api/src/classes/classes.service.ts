import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BoxingClass, BookingStatus, ClassStatus, StaffRole } from '@prisma/client';
import { BranchAccessService } from '../branches/branch-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto, UpdateClassDto } from './dto';

type ClassWithBookings = BoxingClass & {
  bookings: { id: string }[];
  branch?: { name: string } | null;
};

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService
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
          select: { id: true }
        }
      },
      orderBy: { startsAt: 'asc' }
    });

    return classes.map((boxingClass) => this.toClassView(boxingClass));
  }

  async listAdmin(adminId: string, branchId?: string) {
    const branchScope = await this.branchAccess.resolveAdminBranchScope(adminId, branchId);
    const classes = await this.prisma.boxingClass.findMany({
      where: {
        branchId: { in: branchScope.branchIds }
      },
      include: {
        branch: { select: { name: true } },
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true }
        }
      },
      orderBy: { startsAt: 'asc' }
    });

    return classes.map((boxingClass) => this.toClassView(boxingClass));
  }

  async create(adminId: string, dto: CreateClassDto) {
    const branch = await this.branchAccess.ensureBranchExists(dto.branchId);
    await this.branchAccess.ensureAdminBranchRole(adminId, branch.id, [StaffRole.OWNER, StaffRole.MANAGER]);

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
          select: { id: true }
        }
      }
    });

    return this.toClassView(boxingClass);
  }

  async update(adminId: string, id: string, dto: UpdateClassDto) {
    const existing = await this.ensureExists(id);
    await this.branchAccess.ensureAdminBranchRole(adminId, existing.branchId, [StaffRole.OWNER, StaffRole.MANAGER]);

    if (dto.coachId) {
      await this.branchAccess.ensureAdminBranchRole(dto.coachId, existing.branchId, [StaffRole.COACH]);
    }

    const boxingClass = await this.prisma.boxingClass.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.coach !== undefined ? { coachNameSnapshot: dto.coach } : {}),
        ...(dto.coachId !== undefined ? { coachId: dto.coachId } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
        ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {})
      },
      include: {
        branch: { select: { name: true } },
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true }
        }
      }
    });

    return this.toClassView(boxingClass);
  }

  async cancel(adminId: string, id: string) {
    const existing = await this.ensureExists(id);
    await this.branchAccess.ensureAdminBranchRole(adminId, existing.branchId, [StaffRole.OWNER, StaffRole.MANAGER]);

    const boxingClass = await this.prisma.boxingClass.update({
      where: { id },
      data: { status: ClassStatus.CANCELED },
      include: {
        branch: { select: { name: true } },
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true }
        }
      }
    });

    return this.toClassView(boxingClass);
  }

  private async ensureExists(id: string) {
    const existing = await this.prisma.boxingClass.findUnique({ where: { id }, select: { id: true, branchId: true } });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }
    return existing;
  }

  private toClassView(boxingClass: ClassWithBookings) {
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
      status: boxingClass.status,
      description: boxingClass.description
    };
  }
}

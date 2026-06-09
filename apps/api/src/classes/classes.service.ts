import { Injectable, NotFoundException } from '@nestjs/common';
import { BoxingClass, BookingStatus, ClassStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto, UpdateClassDto } from './dto';

type ClassWithBookings = BoxingClass & {
  bookings: { id: string }[];
};

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailable(now = new Date()) {
    const classes = await this.prisma.boxingClass.findMany({
      where: {
        status: ClassStatus.SCHEDULED,
        startsAt: { gt: now }
      },
      include: {
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true }
        }
      },
      orderBy: { startsAt: 'asc' }
    });

    return classes.map((boxingClass) => this.toClassView(boxingClass));
  }

  async listAdmin() {
    const classes = await this.prisma.boxingClass.findMany({
      include: {
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true }
        }
      },
      orderBy: { startsAt: 'asc' }
    });

    return classes.map((boxingClass) => this.toClassView(boxingClass));
  }

  async create(dto: CreateClassDto) {
    const boxingClass = await this.prisma.boxingClass.create({
      data: {
        title: dto.title,
        coach: dto.coach,
        startsAt: new Date(dto.startsAt),
        durationMin: dto.durationMin,
        capacity: dto.capacity,
        description: dto.description
      },
      include: {
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true }
        }
      }
    });

    return this.toClassView(boxingClass);
  }

  async update(id: string, dto: UpdateClassDto) {
    await this.ensureExists(id);

    const boxingClass = await this.prisma.boxingClass.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.coach !== undefined ? { coach: dto.coach } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
        ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {})
      },
      include: {
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true }
        }
      }
    });

    return this.toClassView(boxingClass);
  }

  async cancel(id: string) {
    await this.ensureExists(id);

    const boxingClass = await this.prisma.boxingClass.update({
      where: { id },
      data: { status: ClassStatus.CANCELED },
      include: {
        bookings: {
          where: { status: BookingStatus.BOOKED },
          select: { id: true }
        }
      }
    });

    return this.toClassView(boxingClass);
  }

  private async ensureExists(id: string) {
    const existing = await this.prisma.boxingClass.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }
  }

  private toClassView(boxingClass: ClassWithBookings) {
    const bookedCount = boxingClass.bookings.length;

    return {
      id: boxingClass.id,
      title: boxingClass.title,
      coach: boxingClass.coach,
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

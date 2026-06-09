import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationJob } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async createClassReminder(
    bookingId: string,
    userId: string,
    classStartsAt: Date,
    remindBeforeMinutes: number
  ): Promise<void> {
    const scheduledAt = new Date(classStartsAt.getTime() - remindBeforeMinutes * 60 * 1000);

    await this.prisma.notificationJob.create({
      data: {
        bookingId,
        userId,
        type: 'CLASS_REMINDER',
        scheduledAt,
        templateId: this.config.get<string>('WECHAT_SUBSCRIBE_TEMPLATE_ID') || null
      }
    });
  }

  async listJobsForBooking(bookingId: string): Promise<NotificationJob[]> {
    return this.prisma.notificationJob.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' }
    });
  }
}

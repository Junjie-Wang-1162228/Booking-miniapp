import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationJob, NotificationStatus, Prisma, StaffRole } from '@prisma/client';
import { AlertingService } from '../alerts/alerts.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BranchAccessService } from '../branches/branch-access.service';
import { resolveBusinessTimezoneOffsetMinutes } from '../lesson-deductions/business-day';
import { PrismaService } from '../prisma/prisma.service';
import { AdminNotificationQueryDto } from './dto';
import {
  BOOKING_CREATED_NOTIFICATION_TYPE,
  CLASS_CANCELED_NOTIFICATION_TYPE,
  CLASS_REMINDER_NOTIFICATION_TYPE,
  CLASS_RESCHEDULED_NOTIFICATION_TYPE
} from './notification-types';

type DueClassReminderJob = NotificationJob & {
  branch: {
    name: string;
  };
  booking: {
    boxingClass: {
      title: string;
      startsAt: Date;
    };
  };
};

type ProcessDueClassRemindersResult = {
  sent: number;
  failed: number;
  skipped: number;
};

type WechatAccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

type WechatSendResponse = {
  errcode?: number;
  errmsg?: string;
};

type AdminNotificationJob = Prisma.NotificationJobGetPayload<{
  include: {
    branch: true;
    booking: {
      include: {
        user: true;
        boxingClass: true;
      };
    };
    logs: true;
  };
}>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private accessTokenCache: { appId: string; secret: string; token: string; expiresAtMs: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly branchAccess: BranchAccessService,
    private readonly auditLogs: AuditLogsService,
    private readonly alerting: AlertingService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueClassRemindersCron() {
    if (!this.isWorkerEnabled()) {
      return;
    }

    try {
      await this.processDueClassReminders();
    } catch (error) {
      this.logger.error(`Failed to process class reminders: ${this.errorMessage(error)}`);
    }
  }

  async createClassReminder(
    bookingId: string,
    userId: string,
    gymId: string,
    branchId: string,
    classStartsAt: Date,
    remindBeforeMinutes: number
  ): Promise<void> {
    const scheduledAt = new Date(classStartsAt.getTime() - remindBeforeMinutes * 60 * 1000);

    await this.prisma.notificationJob.create({
      data: {
        gymId,
        branchId,
        bookingId,
        userId,
        type: CLASS_REMINDER_NOTIFICATION_TYPE,
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

  async processDueClassReminders(now = new Date(), limit = 20): Promise<ProcessDueClassRemindersResult> {
    const jobs = await this.prisma.notificationJob.findMany({
      where: {
        type: {
          in: [
            BOOKING_CREATED_NOTIFICATION_TYPE,
            CLASS_REMINDER_NOTIFICATION_TYPE,
            CLASS_CANCELED_NOTIFICATION_TYPE,
            CLASS_RESCHEDULED_NOTIFICATION_TYPE
          ]
        },
        status: NotificationStatus.PENDING,
        scheduledAt: { lte: now }
      },
      include: {
        branch: { select: { name: true } },
        booking: {
          select: {
            boxingClass: {
              select: {
                title: true,
                startsAt: true
              }
            }
          }
        }
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit
    });

    const result: ProcessDueClassRemindersResult = { sent: 0, failed: 0, skipped: 0 };

    for (const job of jobs) {
      const status = await this.processClassReminderJob(job);
      if (status === NotificationStatus.SENT) {
        result.sent += 1;
      } else if (status === NotificationStatus.FAILED) {
        result.failed += 1;
      } else if (status === NotificationStatus.SKIPPED) {
        result.skipped += 1;
      }
    }

    return result;
  }

  async listAdminNotificationJobs(adminId: string, query: AdminNotificationQueryDto) {
    const branchScope = await this.branchAccess.resolveAdminBranchScope(adminId, query.branchId);
    const where: Prisma.NotificationJobWhereInput = {
      branchId: { in: branchScope.branchIds }
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.q) {
      where.OR = [
        { branch: { name: { contains: query.q } } },
        { booking: { user: { displayName: { contains: query.q } } } },
        { booking: { user: { phone: { contains: query.q } } } },
        { booking: { boxingClass: { title: { contains: query.q } } } }
      ];
    }

    const jobs = await this.prisma.notificationJob.findMany({
      where,
      include: this.adminNotificationJobInclude(),
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }]
    });

    return jobs.map((job) => this.toAdminNotificationJobView(job));
  }

  async retryAdminNotificationJob(adminId: string, jobId: string) {
    const job = await this.prisma.notificationJob.findUnique({
      where: { id: jobId },
      select: { id: true, branchId: true, status: true, type: true }
    });

    if (!job) {
      throw new NotFoundException('Notification job not found');
    }

    await this.branchAccess.ensureAdminBranchRole(adminId, job.branchId, [StaffRole.OWNER, StaffRole.MANAGER]);

    if (
      job.type !== BOOKING_CREATED_NOTIFICATION_TYPE &&
      job.type !== CLASS_REMINDER_NOTIFICATION_TYPE &&
      job.type !== CLASS_CANCELED_NOTIFICATION_TYPE &&
      job.type !== CLASS_RESCHEDULED_NOTIFICATION_TYPE
    ) {
      throw new BadRequestException('Only booking confirmation, class reminder, cancellation, or reschedule jobs can be retried');
    }

    if (job.status !== NotificationStatus.FAILED && job.status !== NotificationStatus.SKIPPED) {
      throw new BadRequestException('Only failed or skipped notification jobs can be retried');
    }

    await this.prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: NotificationStatus.PENDING,
        scheduledAt: new Date()
      }
    });

    await this.processClassReminderJobById(job.id);

    const updated = await this.prisma.notificationJob.findUniqueOrThrow({
      where: { id: job.id },
      include: this.adminNotificationJobInclude()
    });

    const latestLog = updated.logs[0] ?? null;
    await this.auditLogs.record({
      gymId: updated.gymId,
      branchId: updated.branchId,
      adminId,
      action: 'NOTIFICATION_RETRY',
      entityType: 'NotificationJob',
      entityId: updated.id,
      message: `重试通知：${updated.booking.user.displayName} / ${updated.booking.boxingClass.title}`,
      metadata: {
        status: updated.status,
        latestLog: latestLog?.message ?? null
      }
    });

    return this.toAdminNotificationJobView(updated);
  }

  async processClassReminderJobById(jobId: string) {
    const job = await this.prisma.notificationJob.findUnique({
      where: { id: jobId },
      include: {
        branch: { select: { name: true } },
        booking: {
          select: {
            boxingClass: {
              select: {
                title: true,
                startsAt: true
              }
            }
          }
        }
      }
    });

    if (!job) {
      throw new NotFoundException('Notification job not found');
    }

    if (job.status !== NotificationStatus.PENDING) {
      return job.status;
    }

    return this.processClassReminderJob(job);
  }

  private async processClassReminderJob(job: DueClassReminderJob): Promise<NotificationStatus> {
    if (!job.templateId) {
      await this.settleJob(job.id, NotificationStatus.SKIPPED, 'Wechat subscribe template id is not configured');
      return NotificationStatus.SKIPPED;
    }

    const appId = this.getMiniappAppId();
    const wechatAccount = await this.prisma.wechatAccount.findFirst({
      where: {
        userId: job.userId,
        appId
      },
      orderBy: { createdAt: 'desc' },
      select: { openid: true }
    });

    if (!wechatAccount) {
      await this.settleJob(job.id, NotificationStatus.SKIPPED, 'Wechat account is not bound to this miniapp');
      return NotificationStatus.SKIPPED;
    }

    try {
      const appSecret = this.getMiniappAppSecret();
      if (!appSecret) {
        throw new Error('Wechat app secret is not configured');
      }

      const accessToken = await this.getWechatAccessToken(appId, appSecret);
      await this.sendWechatSubscribeMessage(accessToken, wechatAccount.openid, job);
      await this.settleJob(job.id, NotificationStatus.SENT, 'Wechat subscribe message sent');
      return NotificationStatus.SENT;
    } catch (error) {
      const message = this.errorMessage(error);
      await this.settleJob(job.id, NotificationStatus.FAILED, message);
      await this.alerting.notify({
        source: 'api',
        event: 'notification_delivery_failed',
        severity: 'warning',
        message,
        metadata: {
          jobId: job.id,
          type: job.type,
          branchId: job.branchId,
          scheduledAt: job.scheduledAt.toISOString()
        }
      });
      return NotificationStatus.FAILED;
    }
  }

  private async getWechatAccessToken(appId: string, secret: string): Promise<string> {
    const now = Date.now();
    if (
      this.accessTokenCache &&
      this.accessTokenCache.appId === appId &&
      this.accessTokenCache.secret === secret &&
      this.accessTokenCache.expiresAtMs > now + 60_000
    ) {
      return this.accessTokenCache.token;
    }

    const params = new URLSearchParams({
      grant_type: 'client_credential',
      appid: appId,
      secret
    });
    const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?${params.toString()}`);
    const body = (await response.json()) as WechatAccessTokenResponse;

    if (!body.access_token) {
      throw new Error(`Wechat access token failed: ${body.errcode ?? 'unknown'} ${body.errmsg ?? ''}`.trim());
    }

    const expiresInSeconds = Number.isFinite(body.expires_in) ? Number(body.expires_in) : 7200;
    this.accessTokenCache = {
      appId,
      secret,
      token: body.access_token,
      expiresAtMs: now + Math.max(expiresInSeconds - 300, 60) * 1000
    };

    return body.access_token;
  }

  private async sendWechatSubscribeMessage(accessToken: string, openid: string, job: DueClassReminderJob) {
    const fields = this.getSubscribeDataFields();
    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: openid,
          template_id: job.templateId,
          page: this.getSubscribePage(),
          miniprogram_state: this.getMiniProgramState(),
          lang: 'zh_CN',
          data: {
            [fields.title]: { value: this.truncateWechatThing(this.notificationTitle(job)) },
            [fields.time]: { value: this.formatClassTime(job.booking.boxingClass.startsAt) },
            [fields.branch]: { value: this.truncateWechatThing(job.branch.name) }
          }
        })
      }
    );
    const body = (await response.json()) as WechatSendResponse;

    if (body.errcode && body.errcode !== 0) {
      throw new Error(`Wechat subscribe message failed: ${body.errcode} ${body.errmsg ?? ''}`.trim());
    }
  }

  private async settleJob(jobId: string, status: NotificationStatus, message: string) {
    await this.prisma.$transaction([
      this.prisma.notificationJob.update({
        where: { id: jobId },
        data: { status }
      }),
      this.prisma.notificationLog.create({
        data: {
          jobId,
          status,
          message: this.truncateLogMessage(message)
        }
      })
    ]);
  }

  private formatClassTime(startsAt: Date) {
    const offsetMinutes = resolveBusinessTimezoneOffsetMinutes(this.config);
    const local = new Date(startsAt.getTime() + offsetMinutes * 60 * 1000);
    const year = local.getUTCFullYear();
    const month = String(local.getUTCMonth() + 1).padStart(2, '0');
    const day = String(local.getUTCDate()).padStart(2, '0');
    const hour = String(local.getUTCHours()).padStart(2, '0');
    const minute = String(local.getUTCMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  private notificationTitle(job: DueClassReminderJob) {
    if (job.type === BOOKING_CREATED_NOTIFICATION_TYPE) {
      return `预约成功：${job.booking.boxingClass.title}`;
    }
    if (job.type === CLASS_CANCELED_NOTIFICATION_TYPE) {
      return `课程取消：${job.booking.boxingClass.title}`;
    }
    if (job.type === CLASS_RESCHEDULED_NOTIFICATION_TYPE) {
      return `课程改期：${job.booking.boxingClass.title}`;
    }
    return job.booking.boxingClass.title;
  }

  private truncateWechatThing(value: string, maxLength = 20) {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }

  private truncateLogMessage(value: string) {
    return value.length > 500 ? value.slice(0, 500) : value;
  }

  private isWorkerEnabled() {
    return this.config.get<string>('WECHAT_NOTIFICATION_WORKER_ENABLED') === 'true';
  }

  private getMiniappAppId() {
    return this.config.get<string>('MINIAPP_APP_ID') || 'touristappid';
  }

  private getMiniappAppSecret() {
    return this.config.get<string>('MINIAPP_APP_SECRET') || '';
  }

  private getSubscribePage() {
    return this.config.get<string>('WECHAT_SUBSCRIBE_PAGE') || 'pages/bookings/index';
  }

  private getMiniProgramState() {
    return this.config.get<string>('WECHAT_SUBSCRIBE_MINIPROGRAM_STATE') || 'formal';
  }

  private getSubscribeDataFields() {
    return {
      title: this.config.get<string>('WECHAT_SUBSCRIBE_CLASS_TITLE_FIELD') || 'thing1',
      time: this.config.get<string>('WECHAT_SUBSCRIBE_CLASS_TIME_FIELD') || 'time2',
      branch: this.config.get<string>('WECHAT_SUBSCRIBE_BRANCH_FIELD') || 'thing3'
    };
  }

  private errorMessage(error: unknown) {
    const message = error instanceof Error && error.message ? error.message : 'Unknown notification error';
    return this.redactSensitiveLogMessage(message);
  }

  private redactSensitiveLogMessage(message: string) {
    return message
      .replace(/\b(openid|unionid|access_token|token|secret|password|jwt)\s*=\s*[^\s&]+/gi, '$1=[redacted]')
      .replace(/\b(openid|unionid)\s+([A-Za-z0-9_-]{8,})\b/gi, '$1 [redacted]')
      .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
      .replace(/\b1[3-9]\d{9}\b/g, '[redacted-phone]');
  }

  private adminNotificationJobInclude() {
    return {
      branch: true,
      booking: {
        include: {
          user: true,
          boxingClass: true
        }
      },
      logs: { orderBy: { createdAt: 'desc' } }
    } satisfies Prisma.NotificationJobInclude;
  }

  private toAdminNotificationJobView(job: AdminNotificationJob) {
    const latestLog = job.logs[0] ?? null;

    return {
      id: job.id,
      gymId: job.gymId,
      branchId: job.branchId,
      branchName: job.branch.name,
      bookingId: job.bookingId,
      userId: job.userId,
      type: job.type,
      status: job.status,
      scheduledAt: job.scheduledAt,
      templateId: job.templateId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      member: {
        id: job.booking.user.id,
        displayName: job.booking.user.displayName,
        phone: job.booking.user.phone
      },
      boxingClass: {
        id: job.booking.boxingClass.id,
        title: job.booking.boxingClass.title,
        startsAt: job.booking.boxingClass.startsAt,
        branchId: job.booking.boxingClass.branchId
      },
      latestLog: latestLog
        ? {
            id: latestLog.id,
            status: latestLog.status,
            message: latestLog.message,
            createdAt: latestLog.createdAt
          }
        : null,
      logCount: job.logs.length
    };
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitScope } from './rate-limit.decorator';

type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

type RateLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly windowMs: number;
  private readonly maxRequests: Record<RateLimitScope, number>;

  constructor(config: ConfigService) {
    this.windowMs = this.readPositiveInt(config.get<string>('RATE_LIMIT_WINDOW_MS'), 60_000);
    this.maxRequests = {
      login: this.readPositiveInt(config.get<string>('RATE_LIMIT_LOGIN_MAX'), 200),
      booking: this.readPositiveInt(config.get<string>('RATE_LIMIT_BOOKING_MAX'), 120)
    };
  }

  consume(scope: RateLimitScope, identifier: string, nowMs = Date.now()): RateLimitResult {
    const key = `${scope}:${identifier}`;
    const maxRequests = this.maxRequests[scope];
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAtMs <= nowMs) {
      this.buckets.set(key, { count: 1, resetAtMs: nowMs + this.windowMs });
      this.cleanupExpired(nowMs);
      return { allowed: true };
    }

    if (existing.count >= maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000))
      };
    }

    existing.count += 1;
    return { allowed: true };
  }

  private cleanupExpired(nowMs: number) {
    if (this.buckets.size < 1000) {
      return;
    }

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAtMs <= nowMs) {
        this.buckets.delete(key);
      }
    }
  }

  private readPositiveInt(value: string | undefined, defaultValue: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
  }
}

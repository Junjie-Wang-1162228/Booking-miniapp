import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RATE_LIMIT_SCOPE_KEY, RateLimitScope } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const scope = this.reflector.getAllAndOverride<RateLimitScope>(RATE_LIMIT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!scope) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const result = this.rateLimit.consume(scope, this.clientIdentifier(request));
    if (result.allowed) {
      return true;
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests',
        retryAfterSeconds: result.retryAfterSeconds
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }

  private clientIdentifier(request: Request) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const forwardedIp = forwardedValue?.split(',')[0]?.trim();

    return forwardedIp || request.ip || request.socket.remoteAddress || 'unknown';
  }
}

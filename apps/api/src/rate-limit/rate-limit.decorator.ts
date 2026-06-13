import { SetMetadata } from '@nestjs/common';

export type RateLimitScope = 'login' | 'booking';

export const RATE_LIMIT_SCOPE_KEY = 'rate-limit-scope';

export const RateLimited = (scope: RateLimitScope) => SetMetadata(RATE_LIMIT_SCOPE_KEY, scope);

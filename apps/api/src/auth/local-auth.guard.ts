import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';

export class LocalAuthGuard extends AuthGuard('local') {
  handleRequest<TUser = User>(
    err: Error | null,
    user: User | false,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Invalid account credentials');
    }
    return user as TUser;
  }
}

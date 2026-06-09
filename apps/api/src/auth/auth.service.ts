import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from './auth.types';

type UserWithBalance = User & {
  lessonBalance: { remaining: number } | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async adminLogin(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { lessonBalance: true }
    });

    if (!user || user.role !== UserRole.ADMIN || !user.passwordHash) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    return this.createSession(user);
  }

  async devLogin(member: 'member-a' | 'member-b') {
    const phone = member === 'member-a' ? '18800000001' : '18800000002';
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { lessonBalance: true }
    });

    if (!user || user.role !== UserRole.USER) {
      throw new BadRequestException('Development member is not seeded');
    }

    return this.createSession(user);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { lessonBalance: true }
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return this.toPublicUser(user);
  }

  private createSession(user: UserWithBalance) {
    const payload: JwtUser = {
      sub: user.id,
      role: user.role,
      displayName: user.displayName
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: this.toPublicUser(user)
    };
  }

  private toPublicUser(user: UserWithBalance) {
    return {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      phone: user.phone,
      lessonBalance: user.lessonBalance ? { remaining: user.lessonBalance.remaining } : null
    };
  }
}

import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env';
import type { RefreshToken, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { REFRESH_REUSE_GRACE_MS } from './auth.constants';
import type { RequestMeta } from './auth.types';
import type { LoginDto, RegisterDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const PRISMA_UNIQUE_VIOLATION = 'P2002';

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshedSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtlMs: number;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {
    this.refreshTtlMs = config.get('REFRESH_TOKEN_TTL_DAYS') * DAY_MS;
  }

  async register(dto: RegisterDto, meta: RequestMeta): Promise<Session> {
    const passwordHash = await this.passwords.hash(dto.password);
    let user: User;
    try {
      user = await this.users.create({ name: dto.name, email: dto.email, passwordHash });
    } catch (error) {
      if ((error as { code?: string }).code === PRISMA_UNIQUE_VIOLATION) {
        throw new ConflictException('An account with this email already exists.');
      }
      throw error;
    }
    return this.openSession(user, meta);
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<Session> {
    const user = await this.users.findByEmail(dto.email);
    // Verified even when the user does not exist, so both failures cost the same time.
    const valid = await this.passwords.verify(user?.passwordHash, dto.password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password.');
    return this.openSession(user, meta);
  }

  /**
   * Rotates the refresh token. Presenting a token that was already rotated is treated as theft
   * and revokes the whole family, except for a short grace window that tolerates parallel tabs.
   */
  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<RefreshedSession> {
    if (!rawToken) throw this.invalidRefresh();

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(rawToken) },
    });
    const now = new Date();
    if (!stored || stored.expiresAt <= now) throw this.invalidRefresh();

    const rotated = stored.revokedAt ? null : await this.rotate(stored, meta, now);
    if (rotated) return this.refreshed(stored.userId, rotated);

    return this.handleRotatedToken(stored.id, meta, now);
  }

  /** Ends the session the token belongs to. Idempotent: unknown or missing tokens are ignored. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(rawToken) },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Authentication required.');
    return user;
  }

  private async openSession(user: User, meta: RequestMeta): Promise<Session> {
    const refresh = await this.issueRefreshToken(user.id, randomUUID(), meta);
    return {
      user,
      accessToken: await this.tokens.signAccessToken(user.id),
      refreshToken: refresh.token,
    };
  }

  private async issueRefreshToken(
    userId: string,
    familyId: string,
    meta: RequestMeta,
  ): Promise<{ id: string; token: string }> {
    const { token, hash } = this.tokens.generateRefreshToken();
    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        ...meta,
      },
    });
    return { id: created.id, token };
  }

  /**
   * Atomically claims `stored` (revokedAt IS NULL) and issues its successor. Returns null when
   * another request claimed it first.
   */
  private rotate(
    stored: RefreshToken,
    meta: RequestMeta,
    now: Date,
  ): Promise<{ token: string } | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (claimed.count === 0) return null;

      const { token, hash } = this.tokens.generateRefreshToken();
      const next = await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          familyId: stored.familyId,
          tokenHash: hash,
          expiresAt: new Date(now.getTime() + this.refreshTtlMs),
          ...meta,
        },
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { replacedById: next.id },
      });
      return { token };
    });
  }

  /** Decides between "parallel tab" (grace window) and "reuse" (revoke the family). */
  private async handleRotatedToken(
    id: string,
    meta: RequestMeta,
    now: Date,
  ): Promise<RefreshedSession> {
    const stored = await this.prisma.refreshToken.findUniqueOrThrow({
      where: { id },
      include: { replacedBy: true },
    });

    const withinGrace =
      stored.revokedAt !== null &&
      now.getTime() - stored.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS &&
      stored.replacedBy !== null &&
      stored.replacedBy.revokedAt === null;

    if (withinGrace) {
      // A sibling in the same family: the successor stays valid for the tab that got it.
      const sibling = await this.issueRefreshToken(stored.userId, stored.familyId, meta);
      return this.refreshed(stored.userId, sibling);
    }

    await this.revokeFamily(stored.familyId);
    this.logger.warn(`Refresh token reuse detected; family ${stored.familyId} revoked.`);
    throw this.invalidRefresh();
  }

  private async refreshed(userId: string, refresh: { token: string }): Promise<RefreshedSession> {
    return {
      userId,
      accessToken: await this.tokens.signAccessToken(userId),
      refreshToken: refresh.token,
    };
  }

  private revokeFamily(familyId: string): Promise<unknown> {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException('Invalid or expired refresh token.');
  }
}

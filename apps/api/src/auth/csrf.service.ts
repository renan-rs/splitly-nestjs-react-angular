import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env';
import { ACCESS_COOKIE, ANONYMOUS_CSRF_CONTEXT } from './auth.constants';
import { TokenService } from './token.service';

/**
 * Signed double-submit tokens (OWASP): `<random>.<HMAC(secret, context, random)>`.
 * The context is the user id from the access cookie (or "anonymous"), so a token planted by an
 * attacker, or taken from another session, does not validate for the victim.
 */
@Injectable()
export class CsrfService {
  private readonly secret: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly tokens: TokenService,
  ) {
    this.secret = config.get('CSRF_SECRET');
  }

  /** An expired access token still identifies the session: refresh requests are CSRF-checked too. */
  async contextFor(request: Request): Promise<string> {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const userId = await this.tokens.verifyAccessToken(cookies?.[ACCESS_COOKIE], {
      ignoreExpiration: true,
    });
    return userId ?? ANONYMOUS_CSRF_CONTEXT;
  }

  create(context: string): string {
    const random = randomBytes(32).toString('base64url');
    return `${random}.${this.sign(context, random)}`;
  }

  isValid(token: string, context: string): boolean {
    const [random, signature, ...rest] = token.split('.');
    if (!random || !signature || rest.length > 0) return false;
    return safeEqual(signature, this.sign(context, random));
  }

  private sign(context: string, random: string): string {
    return createHmac('sha256', this.secret)
      .update(`${context.length}:${context}.${random}`)
      .digest('base64url');
  }
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

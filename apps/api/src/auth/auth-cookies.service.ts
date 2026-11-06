import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';
import {
  ACCESS_COOKIE,
  ANONYMOUS_CSRF_CONTEXT,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  XSRF_COOKIE,
} from './auth.constants';
import { CsrfService } from './csrf.service';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthCookiesService {
  private readonly secure: boolean;
  private readonly maxAgeMs: number;

  constructor(
    config: ConfigService<Env, true>,
    private readonly csrf: CsrfService,
  ) {
    this.secure = config.get('COOKIE_SECURE');
    this.maxAgeMs = config.get('REFRESH_TOKEN_TTL_DAYS') * DAY_MS;
  }

  /**
   * The access cookie outlives the JWT inside it on purpose: the expired token still identifies
   * the session for the CSRF check on the refresh request. The JWT's own `exp` limits access.
   */
  setAccessToken(response: Response, accessToken: string): void {
    response.cookie(ACCESS_COOKIE, accessToken, this.httpOnly('/'));
  }

  setSession(response: Response, tokens: { accessToken: string; refreshToken: string }): void {
    this.setAccessToken(response, tokens.accessToken);
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, this.httpOnly(REFRESH_COOKIE_PATH));
  }

  /** The XSRF cookie must be readable by JavaScript so the frontends can echo it in a header. */
  setCsrf(response: Response, context: string): void {
    response.cookie(XSRF_COOKIE, this.csrf.create(context), {
      httpOnly: false,
      secure: this.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: this.maxAgeMs,
    });
  }

  /** Clears the session and hands out a fresh anonymous CSRF token so the next login can proceed. */
  clearSession(response: Response): void {
    response.clearCookie(ACCESS_COOKIE, this.httpOnly('/'));
    response.clearCookie(REFRESH_COOKIE, this.httpOnly(REFRESH_COOKIE_PATH));
    this.setCsrf(response, ANONYMOUS_CSRF_CONTEXT);
  }

  private httpOnly(path: string): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path,
      maxAge: this.maxAgeMs,
    };
  }
}

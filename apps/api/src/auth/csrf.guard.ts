import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { XSRF_COOKIE, XSRF_HEADER } from './auth.constants';
import { CsrfService, safeEqual } from './csrf.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const cookie = cookies?.[XSRF_COOKIE];
    const header = request.get(XSRF_HEADER);

    if (
      !cookie ||
      !header ||
      !safeEqual(cookie, header) ||
      !this.csrf.isValid(cookie, await this.csrf.contextFor(request))
    ) {
      throw new ForbiddenException('Invalid or missing CSRF token.');
    }
    return true;
  }
}

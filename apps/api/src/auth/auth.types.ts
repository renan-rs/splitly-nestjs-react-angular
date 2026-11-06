import type { Request } from 'express';

export interface AuthUser {
  id: string;
}

export type AuthenticatedRequest = Request & { user: AuthUser };

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

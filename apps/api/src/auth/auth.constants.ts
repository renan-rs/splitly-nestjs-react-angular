export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const XSRF_COOKIE = 'XSRF-TOKEN';
export const XSRF_HEADER = 'x-xsrf-token';

/** The refresh cookie is only sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * A refresh token that was rotated less than this long ago is still honoured once more, so that
 * parallel tabs racing on the same cookie are not mistaken for token theft (see ADR 0001).
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

export const ANONYMOUS_CSRF_CONTEXT = 'anonymous';

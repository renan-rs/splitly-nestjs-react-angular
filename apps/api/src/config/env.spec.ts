import { validateEnv } from './env';

const SECRETS = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  CSRF_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults and parses CORS origins', () => {
    const env = validateEnv({
      ...SECRETS,
      DATABASE_URL: 'postgresql://x',
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('throws when a required variable is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('throws on an invalid value', () => {
    expect(() => validateEnv({ ...SECRETS, DATABASE_URL: 'x', PORT: 'abc' })).toThrow(/PORT/);
  });

  it('requires long secrets', () => {
    expect(() =>
      validateEnv({ ...SECRETS, DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('enables secure cookies by default only in production', () => {
    const base = { ...SECRETS, DATABASE_URL: 'x' };

    expect(validateEnv(base).COOKIE_SECURE).toBe(false);
    expect(validateEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
    expect(
      validateEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).COOKIE_SECURE,
    ).toBe(false);
  });

  it.each([
    ['false', false],
    ['true', true],
    ['1', 1],
    ['10.0.0.0/8,loopback', '10.0.0.0/8,loopback'],
  ])('parses TRUST_PROXY=%s', (raw, expected) => {
    const env = validateEnv({ ...SECRETS, DATABASE_URL: 'x', TRUST_PROXY: raw });

    expect(env.TRUST_PROXY).toBe(expected);
  });
});

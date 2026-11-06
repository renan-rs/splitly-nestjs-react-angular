import { validateEnv } from './env';

describe('validateEnv', () => {
  it('applies defaults and parses CORS origins', () => {
    const env = validateEnv({
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
    expect(() => validateEnv({ DATABASE_URL: 'x', PORT: 'abc' })).toThrow(/PORT/);
  });
});

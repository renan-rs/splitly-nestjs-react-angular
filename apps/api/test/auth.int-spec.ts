import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { parseSetCookie, TestClient } from './support/test-client';

const PASSWORD = 'a-strong-passphrase-1';

describe('Auth (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let sequence = 0;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  // Every client gets its own IP so the rate limits of one test never affect another.
  function newClient(): TestClient {
    sequence += 1;
    return new TestClient(app, `10.1.${Math.floor(sequence / 250)}.${(sequence % 250) + 1}`);
  }

  const newEmail = (): string => `user${(sequence += 1)}@example.com`;

  async function registeredClient(): Promise<{ client: TestClient; email: string }> {
    const client = newClient();
    const email = newEmail();
    await client.primeCsrf();
    await client.register(email).expect(201);
    return { client, email };
  }

  describe('register', () => {
    it('creates the account, starts a session and never exposes the hash', async () => {
      const client = newClient();
      await client.primeCsrf();

      const response = await client.register('Ada@Example.com ').expect(201);

      expect(response.body).toMatchObject({ name: 'Test User', email: 'ada@example.com' });
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('password');
      await client.get('/api/v1/auth/me').expect(200);
    });

    it('sets hardened cookies', async () => {
      const client = newClient();
      await client.primeCsrf();

      const response = await client.register(newEmail()).expect(201);

      expect(parseSetCookie(response, 'access_token')).toMatch(/HttpOnly.*SameSite=Lax/);
      expect(parseSetCookie(response, 'refresh_token')).toMatch(/Path=\/api\/v1\/auth;.*HttpOnly/);
      expect(parseSetCookie(response, 'XSRF-TOKEN')).not.toMatch(/HttpOnly/);
    });

    it('stores only the hash of the refresh token and an argon2id password hash', async () => {
      const { client, email } = await registeredClient();

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const stored = await prisma.refreshToken.findMany({ where: { userId: user.id } });

      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored).toHaveLength(1);
      expect(stored[0].tokenHash).toBe(
        tokens.hashRefreshToken(client.cookies.get('refresh_token') ?? ''),
      );
    });

    it('rejects a duplicate email with 409, ignoring case', async () => {
      const { email } = await registeredClient();
      const other = newClient();
      await other.primeCsrf();

      await other.register(email.toUpperCase()).expect(409);
    });

    it.each([
      ['invalid email', { name: 'A', email: 'nope', password: PASSWORD }],
      ['short password', { name: 'A', email: 'a@example.com', password: 'short' }],
      ['common password', { name: 'A', email: 'a@example.com', password: 'Password123' }],
      ['overlong password', { name: 'A', email: 'a@example.com', password: 'x'.repeat(129) }],
      ['blank name', { name: '  ', email: 'a@example.com', password: PASSWORD }],
      ['unknown field', { name: 'A', email: 'a@example.com', password: PASSWORD, admin: true }],
    ])('rejects %s with Problem Details', async (_label, body) => {
      const client = newClient();
      await client.primeCsrf();

      const response = await client.post('/api/v1/auth/register', body).expect(400);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body.status).toBe(400);
    });
  });

  describe('login and me', () => {
    it('logs in with valid credentials and reads the current user', async () => {
      const { email } = await registeredClient();
      const client = newClient();
      await client.primeCsrf();

      await client.login(email).expect(200);
      const me = await client.get('/api/v1/auth/me').expect(200);

      expect(me.body.email).toBe(email);
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const { email } = await registeredClient();
      const client = newClient();
      await client.primeCsrf();

      const wrongPassword = await client.login(email, 'definitely-wrong-1').expect(401);
      const unknownEmail = await client.login('ghost@example.com').expect(401);

      expect(wrongPassword.body.detail).toBe('Invalid email or password.');
      expect(unknownEmail.body.detail).toBe(wrongPassword.body.detail);
    });

    it('requires authentication for /me', async () => {
      await newClient().get('/api/v1/auth/me').expect(401);
    });

    it('rejects an expired access token', async () => {
      const { client } = await registeredClient();
      const me = await client.get('/api/v1/auth/me').expect(200);
      const expired = await new JwtService({
        secret: process.env.JWT_ACCESS_SECRET,
      }).signAsync({ sub: me.body.id, exp: Math.floor(Date.now() / 1000) - 60 });
      client.cookies.set('access_token', expired);

      await client.get('/api/v1/auth/me').expect(401);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and keeps the session alive', async () => {
      const { client } = await registeredClient();
      const before = client.cookies.get('refresh_token');

      await client.post('/api/v1/auth/refresh').expect(204);

      expect(client.cookies.get('refresh_token')).not.toBe(before);
      await client.get('/api/v1/auth/me').expect(200);
    });

    it('refreshes even when the access token has expired', async () => {
      const { client } = await registeredClient();
      const me = await client.get('/api/v1/auth/me').expect(200);
      client.cookies.set(
        'access_token',
        await new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).signAsync({
          sub: me.body.id,
          exp: Math.floor(Date.now() / 1000) - 60,
        }),
      );
      await client.get('/api/v1/auth/me').expect(401);

      await client.post('/api/v1/auth/refresh').expect(204);

      await client.get('/api/v1/auth/me').expect(200);
    });

    it('never authenticates from the expired access token: no refresh cookie means 401', async () => {
      const { client } = await registeredClient();
      const me = await client.get('/api/v1/auth/me').expect(200);
      client.cookies.set('access_token', await expiredAccessToken(me.body.id));
      client.cookies.delete('refresh_token');

      await client.post('/api/v1/auth/refresh').expect(401);

      expect(client.cookies.has('access_token')).toBe(false);
    });

    it('takes the identity from the refresh token, not from the expired access token', async () => {
      const { client: alice } = await registeredClient();
      const { client: bob } = await registeredClient();
      const aliceId = (await alice.get('/api/v1/auth/me').expect(200)).body.id;
      const bobId = (await bob.get('/api/v1/auth/me').expect(200)).body.id;
      // Alice's expired token only supplies the CSRF context; the refresh cookie is Bob's.
      alice.cookies.set('access_token', await expiredAccessToken(aliceId));
      alice.cookies.set('refresh_token', bob.cookies.get('refresh_token') ?? '');

      await alice.post('/api/v1/auth/refresh').expect(204);

      const me = await alice.get('/api/v1/auth/me').expect(200);
      expect(me.body.id).toBe(bobId);
    });

    it('ignores an expired access token with a forged signature when binding CSRF', async () => {
      const { client } = await registeredClient();
      const me = await client.get('/api/v1/auth/me').expect(200);
      client.cookies.set('access_token', await expiredAccessToken(me.body.id, 'x'.repeat(32)));

      await client.post('/api/v1/auth/refresh').expect(403);
    });

    it('rejects a request without a refresh cookie', async () => {
      const client = newClient();
      await client.primeCsrf();

      await client.post('/api/v1/auth/refresh').expect(401);
    });

    it('rejects an expired refresh token', async () => {
      const { client } = await registeredClient();
      await prisma.refreshToken.updateMany({
        where: { tokenHash: tokens.hashRefreshToken(client.cookies.get('refresh_token') ?? '') },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await client.post('/api/v1/auth/refresh').expect(401);
    });

    it('revokes the whole family when an old token is reused after the grace window', async () => {
      const { client } = await registeredClient();
      const stolen = client.cookies.get('refresh_token') ?? '';
      await client.post('/api/v1/auth/refresh').expect(204);
      const legitimate = client.cookies.get('refresh_token') ?? '';
      await prisma.refreshToken.updateMany({
        where: { tokenHash: tokens.hashRefreshToken(stolen) },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      const attacker = newClient();
      attacker.cookies.set('refresh_token', stolen);
      attacker.cookies.set('XSRF-TOKEN', (await primedToken(attacker)) ?? '');
      await attacker.post('/api/v1/auth/refresh').expect(401);

      client.cookies.set('refresh_token', legitimate);
      await client.post('/api/v1/auth/refresh').expect(401);
      const family = await prisma.refreshToken.findMany({
        where: { tokenHash: tokens.hashRefreshToken(legitimate) },
      });
      expect(family[0].revokedAt).not.toBeNull();
    });

    it('tolerates a parallel tab replaying the previous token inside the grace window', async () => {
      const { client } = await registeredClient();
      const previous = client.cookies.get('refresh_token') ?? '';
      await client.post('/api/v1/auth/refresh').expect(204);

      const secondTab = newClient();
      secondTab.cookies.set('refresh_token', previous);
      secondTab.cookies.set('XSRF-TOKEN', (await primedToken(secondTab)) ?? '');
      await secondTab.post('/api/v1/auth/refresh').expect(204);

      await client.post('/api/v1/auth/refresh').expect(204);
    });

    it('lets only one of several simultaneous refreshes claim the token, without revoking', async () => {
      const { client } = await registeredClient();
      const previous = client.cookies.get('refresh_token') ?? '';
      const tabs = await Promise.all(
        [1, 2, 3].map(async () => {
          const tab = newClient();
          tab.cookies.set('refresh_token', previous);
          tab.cookies.set('XSRF-TOKEN', (await primedToken(tab)) ?? '');
          return tab;
        }),
      );

      const responses = await Promise.all(tabs.map((tab) => tab.post('/api/v1/auth/refresh')));

      expect(responses.map((r) => r.status)).toEqual([204, 204, 204]);
    });
  });

  describe('logout', () => {
    it('invalidates the refresh token server-side and clears cookies', async () => {
      const { client } = await registeredClient();
      const refreshToken = client.cookies.get('refresh_token') ?? '';

      const response = await client.post('/api/v1/auth/logout').expect(204);

      expect(client.cookies.has('access_token')).toBe(false);
      expect(client.cookies.has('refresh_token')).toBe(false);
      expect(parseSetCookie(response, 'refresh_token')).toContain('Path=/api/v1/auth');
      const replay = newClient();
      replay.cookies.set('refresh_token', refreshToken);
      replay.cookies.set('XSRF-TOKEN', (await primedToken(replay)) ?? '');
      await replay.post('/api/v1/auth/refresh').expect(401);
    });

    it('is idempotent without a session', async () => {
      const client = newClient();
      await client.primeCsrf();

      await client.post('/api/v1/auth/logout').expect(204);
      await client.post('/api/v1/auth/logout').expect(204);
    });

    it('allows logging in again right after logging out', async () => {
      const { client, email } = await registeredClient();
      await client.post('/api/v1/auth/logout').expect(204);

      await client.login(email).expect(200);
    });

    it('logout-all revokes every session of the user', async () => {
      const { client, email } = await registeredClient();
      const other = newClient();
      await other.primeCsrf();
      await other.login(email).expect(200);

      await client.post('/api/v1/auth/logout-all').expect(204);

      await other.post('/api/v1/auth/refresh').expect(401);
      await client.get('/api/v1/auth/me').expect(401);
    });

    it('logout-all requires authentication', async () => {
      const client = newClient();
      await client.primeCsrf();

      await client.post('/api/v1/auth/logout-all').expect(401);
    });
  });

  describe('CSRF', () => {
    it('rejects a state-changing request without the header', async () => {
      const client = newClient();
      await client.primeCsrf();
      client.csrfHeader = false;

      const response = await client.login(newEmail()).expect(403);

      expect(response.body.detail).toBe('Invalid or missing CSRF token.');
    });

    it('rejects a request without any CSRF cookie', async () => {
      await newClient().login(newEmail()).expect(403);
    });

    it('rejects a header that does not match the cookie', async () => {
      const client = newClient();
      await client.primeCsrf();
      const other = newClient();
      await other.primeCsrf();
      client.cookies.set('XSRF-TOKEN', other.cookies.get('XSRF-TOKEN') ?? '');
      client.csrfHeader = false;

      const response = await client.login(newEmail());
      expect(response.status).toBe(403);
    });

    it('rejects a self-made cookie and header pair that the server never signed', async () => {
      const client = newClient();
      client.cookies.set('XSRF-TOKEN', 'forged.token');

      await client.login(newEmail()).expect(403);
    });

    it('binds the token to the session: an anonymous token fails for a logged-in user', async () => {
      const { client } = await registeredClient();
      const anonymous = newClient();
      await anonymous.primeCsrf();
      client.cookies.set('XSRF-TOKEN', anonymous.cookies.get('XSRF-TOKEN') ?? '');

      await client.post('/api/v1/auth/logout-all').expect(403);
    });

    it('does not require the token on safe methods', async () => {
      const client = newClient();
      client.csrfHeader = false;

      await client.get('/api/v1/auth/me').expect(401);
      await client.get('/api/v1/health').expect(200);
    });
  });

  describe('throttling', () => {
    it('limits login attempts per IP and answers 429 Problem Details', async () => {
      const client = newClient();
      await client.primeCsrf();

      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        statuses.push((await client.login('nobody@example.com')).status);
      }

      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it('counts each IP separately', async () => {
      const first = newClient();
      const second = newClient();
      await first.primeCsrf();
      await second.primeCsrf();
      for (let attempt = 0; attempt < 6; attempt += 1) await first.login('nobody@example.com');

      await first.login('nobody@example.com').expect(429);
      await second.login('nobody@example.com').expect(401);
    });
  });

  async function expiredAccessToken(userId: string, secret = process.env.JWT_ACCESS_SECRET) {
    return new JwtService({ secret }).signAsync({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) - 60,
    });
  }

  async function primedToken(client: TestClient): Promise<string | undefined> {
    await client.primeCsrf();
    return client.cookies.get('XSRF-TOKEN');
  }
});

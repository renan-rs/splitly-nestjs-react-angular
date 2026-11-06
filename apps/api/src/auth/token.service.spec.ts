import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

const jwt = new JwtService({ secret: 'k'.repeat(32), signOptions: { expiresIn: 60 } });
const service = new TokenService(jwt);

describe('TokenService', () => {
  it('round-trips the user id through the access token', async () => {
    const token = await service.signAccessToken('user-1');

    await expect(service.verifyAccessToken(token)).resolves.toBe('user-1');
  });

  it('rejects missing, forged and expired tokens', async () => {
    const forged = await new JwtService({ secret: 'x'.repeat(32) }).signAsync({ sub: 'user-1' });
    const expired = await new JwtService({ secret: 'k'.repeat(32) }).signAsync({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(service.verifyAccessToken(undefined)).resolves.toBeNull();
    await expect(service.verifyAccessToken(forged)).resolves.toBeNull();
    await expect(service.verifyAccessToken(expired)).resolves.toBeNull();
    await expect(service.verifyAccessToken(expired, { ignoreExpiration: true })).resolves.toBe(
      'user-1',
    );
  });

  it('generates unique 256-bit refresh tokens and hashes them deterministically', () => {
    const a = service.generateRefreshToken();
    const b = service.generateRefreshToken();

    expect(Buffer.from(a.token, 'base64url')).toHaveLength(32);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(service.hashRefreshToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});

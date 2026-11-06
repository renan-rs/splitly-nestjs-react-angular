import { isCommonPassword } from './common-passwords';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  beforeAll(() => service.onModuleInit());

  it('hashes with argon2id and verifies the right password only', async () => {
    const hash = await service.hash('correct horse battery');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, 'correct horse battery')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong')).resolves.toBe(false);
  });

  it('never validates when there is no stored hash', async () => {
    await expect(service.verify(undefined, 'anything')).resolves.toBe(false);
  });

  it('treats a malformed stored hash as a mismatch', async () => {
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });
});

describe('isCommonPassword', () => {
  it('is case-insensitive', () => {
    expect(isCommonPassword('PassWord123')).toBe(true);
  });

  it('lets uncommon passwords through', () => {
    expect(isCommonPassword('t7-Gorilla-mantle')).toBe(false);
  });
});

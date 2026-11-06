import { CsrfService } from './csrf.service';

const service = new CsrfService({ get: () => 's'.repeat(32) } as never, {} as never);

describe('CsrfService', () => {
  it('accepts a token for the context it was issued for', () => {
    expect(service.isValid(service.create('user-1'), 'user-1')).toBe(true);
  });

  it('rejects a token used with a different context', () => {
    expect(service.isValid(service.create('anonymous'), 'user-1')).toBe(false);
  });

  it('rejects a tampered signature or random part', () => {
    const [random, signature] = service.create('user-1').split('.');

    expect(service.isValid(`${random}.${signature}x`, 'user-1')).toBe(false);
    expect(service.isValid(`other.${signature}`, 'user-1')).toBe(false);
  });

  it('rejects a token signed with another secret', () => {
    const other = new CsrfService({ get: () => 'o'.repeat(32) } as never, {} as never);

    expect(service.isValid(other.create('user-1'), 'user-1')).toBe(false);
  });

  it.each(['', 'no-dot', 'a.b.c', '.sig', 'rand.'])('rejects malformed token %j', (token) => {
    expect(service.isValid(token, 'user-1')).toBe(false);
  });

  it('does not confuse contexts that differ only at the boundary', () => {
    const token = service.create('ab');

    expect(service.isValid(token, 'a')).toBe(false);
  });
});

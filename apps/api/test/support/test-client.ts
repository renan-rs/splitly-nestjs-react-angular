import { INestApplication } from '@nestjs/common';
import request, { Response, Test } from 'supertest';

const REFRESH_PATH = '/api/v1/auth';

/**
 * A minimal browser stand-in: keeps cookies (honouring the refresh cookie's path), echoes the
 * XSRF-TOKEN cookie in the X-XSRF-TOKEN header, and presents a fixed client IP.
 */
export class TestClient {
  readonly cookies = new Map<string, string>();
  csrfHeader = true;

  constructor(
    private readonly app: INestApplication,
    readonly ip: string,
  ) {}

  get(path: string): Test {
    return this.send('get', path);
  }

  post(path: string, body?: object): Test {
    return this.send('post', path, body);
  }

  /** Fetches the anonymous XSRF cookie, as a frontend does before its first state-changing call. */
  async primeCsrf(): Promise<void> {
    await this.get('/api/v1/auth/csrf');
  }

  register(email: string, password = 'a-strong-passphrase-1'): Test {
    return this.post('/api/v1/auth/register', { name: 'Test User', email, password });
  }

  login(email: string, password = 'a-strong-passphrase-1'): Test {
    return this.post('/api/v1/auth/login', { email, password });
  }

  private send(method: 'get' | 'post', path: string, body?: object): Test {
    const req = request(this.app.getHttpServer())[method](path).set('X-Forwarded-For', this.ip);
    const cookie = this.cookieHeaderFor(path);
    if (cookie) req.set('Cookie', cookie);
    const xsrf = this.cookies.get('XSRF-TOKEN');
    if (this.csrfHeader && xsrf) req.set('X-XSRF-TOKEN', xsrf);
    if (body) req.send(body);

    req.on('response', (response: Response) =>
      this.storeCookies(response.headers['set-cookie'] as unknown as string[] | undefined),
    );
    return req;
  }

  private cookieHeaderFor(path: string): string {
    return [...this.cookies]
      .filter(([name]) => name !== 'refresh_token' || path.startsWith(REFRESH_PATH))
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private storeCookies(setCookie: string[] | undefined): void {
    for (const line of setCookie ?? []) {
      const [pair, ...attributes] = line.split('; ');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      const expired = attributes.some((a) =>
        a.toLowerCase().startsWith('expires=thu, 01 jan 1970'),
      );
      if (!value || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

export function parseSetCookie(response: Response, name: string): string | undefined {
  const lines = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return lines.find((line) => line.startsWith(`${name}=`));
}

import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

declare global {
  var __POSTGRES__: StartedPostgreSqlContainer | undefined;
}

// Runs once before the integration suites. The environment must be set here because
// ConfigModule reads it when app.module.ts is first imported.
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  globalThis.__POSTGRES__ = container;
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-0123456789';
  process.env.CSRF_SECRET = 'integration-test-csrf-secret-0123456789ab';
  // Lets each test pick its own client IP through X-Forwarded-For, so rate limits do not interfere.
  process.env.TRUST_PROXY = 'true';

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
}

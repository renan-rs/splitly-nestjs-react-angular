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
}

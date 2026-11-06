import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // `prisma generate` (run on install and in Docker builds) does not need a database,
  // so a missing URL must not fail it; commands that connect will still fail clearly.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});

// Imported first by export-openapi.ts: ConfigModule validates the environment as soon as
// app.module.ts is loaded. Building the document needs no live database (Prisma connects lazily).
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.LOG_LEVEL = 'silent';

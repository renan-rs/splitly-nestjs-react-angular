# 0004 — Generate the Prisma client as CommonJS

## Context

Prisma 7's `prisma-client` generator emits ESM by default: relative imports end in `.js` and the
code may use `import.meta`. The Nest API is compiled as CommonJS (`module: nodenext`, no
`"type": "module"`), so Jest, ts-node (OpenAPI export) and `nest build` could not resolve those imports.
Patching each tool with module-name mappers would be fragile.

## Decision

Set `moduleFormat = "cjs"` and `importFileExtension = ""` in the generator block of
`apps/api/prisma/schema.prisma`. The client is generated into `src/generated/prisma` (git-ignored)
by `prisma generate`, which runs on `postinstall` and in the API Dockerfile.

`prisma.config.ts` falls back to an empty `DATABASE_URL`, because `generate` does not need a
database and must work on a fresh clone and in CI.

## Consequences

- Jest, ts-node, `nest build` and the Docker image all use the client without special configuration.
- A fresh checkout needs `pnpm install` (which generates the client) before typechecking.
- Migrating the API to ESM later means flipping both settings and the TypeScript module config together.

# Splitly

Group expense splitting app: NestJS API with independent React and Angular frontends that share one
OpenAPI contract. Work in progress.

## Requirements

- Node.js (version in `.nvmrc`) and pnpm
- Docker

## Run everything with Docker

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD and the two secrets
docker compose up --build
```

A one-shot `migrate` service applies pending Prisma migrations before the API starts.

| Service     | URL                                 |
| ----------- | ----------------------------------- |
| API         | http://localhost:3000/api/v1/health |
| Swagger     | http://localhost:3000/docs          |
| web-react   | http://localhost:5173               |
| web-angular | http://localhost:4200               |

Both frontends proxy `/api/*` to the API, so the browser only talks to its own origin.

## Run locally

```bash
pnpm install
cp .env.example .env                       # POSTGRES_PASSWORD for compose
cp apps/api/.env.example apps/api/.env     # use the same password in DATABASE_URL
docker compose up -d db
pnpm --filter api dev                      # API on :3000
pnpm --filter web-react dev                # :5173
pnpm --filter web-angular start            # :4200
```

## Commands

| Command                 | What it does                                                                 |
| ----------------------- | ---------------------------------------------------------------------------- |
| `pnpm check`            | lint + typecheck + unit tests (must pass before a slice is done)             |
| `pnpm lint`             | ESLint in every workspace                                                    |
| `pnpm typecheck`        | TypeScript checks in every workspace                                         |
| `pnpm test`             | Unit tests                                                                   |
| `pnpm test:integration` | API integration tests against a real Postgres (Testcontainers, needs Docker) |
| `pnpm test:e2e`         | End-to-end tests (added in later slices)                                     |
| `pnpm format`           | Prettier                                                                     |
| `pnpm gen:api-client`   | Export the OpenAPI spec and regenerate `packages/api-client`                 |

## Configuration

API environment variables (see `apps/api/.env.example`); the app refuses to start if they are invalid.

| Variable                   | Default                                       | Description                                                                                                              |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`             | required                                      | PostgreSQL connection string                                                                                             |
| `PORT`                     | `3000`                                        | HTTP port                                                                                                                |
| `CORS_ORIGINS`             | `http://localhost:5173,http://localhost:4200` | Comma-separated allowed origins                                                                                          |
| `LOG_LEVEL`                | `info`                                        | Pino log level                                                                                                           |
| `NODE_ENV`                 | `development`                                 | `development`, `test` or `production`                                                                                    |
| `JWT_ACCESS_SECRET`        | required                                      | Signs access tokens (min. 32 chars)                                                                                      |
| `CSRF_SECRET`              | required                                      | Signs CSRF tokens (min. 32 chars)                                                                                        |
| `ACCESS_TOKEN_TTL_SECONDS` | `900`                                         | Access token lifetime                                                                                                    |
| `REFRESH_TOKEN_TTL_DAYS`   | `7`                                           | Refresh token lifetime (1-30)                                                                                            |
| `COOKIE_SECURE`            | `true` in production, else `false`            | `Secure` flag on auth cookies                                                                                            |
| `TRUST_PROXY`              | `false`                                       | Express `trust proxy`: `true`, a hop count or CIDRs. Set behind a reverse proxy so rate limiting sees the real client IP |

## Project structure

```
apps/api           NestJS REST API
apps/web-react     React SPA
apps/web-angular   Angular SPA
packages/api-client  Types generated from the API's OpenAPI spec
docs/adr           Architecture decision records
```

Decisions: [ADR 0001](docs/adr/0001-cookie-based-auth-with-refresh-rotation.md),
[ADR 0003](docs/adr/0003-typescript-6-toolchain.md),
[ADR 0004](docs/adr/0004-prisma-client-commonjs.md).

# 0003 — Pin TypeScript to 6.x across the monorepo

## Context

The bootstrap installed TypeScript 7 in `web-react` and TypeScript 6 elsewhere. TypeScript 7 no longer
ships the JavaScript compiler API. `typescript-eslint` refuses to run on it ("does not support TS 7.0"),
and `openapi-typescript` crashes at import time because it uses that API. Both tools are required:
lint is part of `pnpm check`, and the API client is generated from the OpenAPI contract.

## Decision

Use TypeScript `~6.0` in every workspace (`api`, `web-react`, `web-angular`, `packages/api-client`).
Revisit when `typescript-eslint` and `openapi-typescript` support TS 7.

## Consequences

- One compiler version everywhere, so `typecheck` behaves the same in all apps.
- We do not get TS 7 speed-ups for now.
- Upgrading is a single, deliberate change once the tooling catches up.

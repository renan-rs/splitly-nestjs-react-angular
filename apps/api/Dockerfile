# Build context: repository root (docker compose sets it).
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma/
COPY apps/api/prisma.config.ts apps/api/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter api...

COPY apps/api apps/api
RUN pnpm --filter api db:generate && pnpm --filter api build
RUN pnpm --filter api deploy --prod --ignore-scripts /out \
    && cp -r apps/api/dist /out/dist

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
CMD ["node", "dist/main"]

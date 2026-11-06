# Build context: repository root (docker compose sets it).
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web-react/package.json apps/web-react/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter web-react...

COPY apps/web-react apps/web-react
RUN pnpm --filter web-react build

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY apps/web-react/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web-react/dist /usr/share/nginx/html
EXPOSE 8080

# Build context: repository root (docker compose sets it).
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web-angular/package.json apps/web-angular/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter web-angular...

COPY apps/web-angular apps/web-angular
RUN pnpm --filter web-angular build

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY apps/web-angular/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web-angular/dist/web-angular/browser /usr/share/nginx/html
EXPOSE 8080

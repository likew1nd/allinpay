FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@12.16.1
COPY contracts /project/contracts

FROM base AS api
WORKDIR /project/apps/api
COPY apps/api/package.json apps/api/pnpm-lock.yaml apps/api/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/api/apps apps
COPY apps/api/libs libs
COPY apps/api/prisma prisma
COPY apps/api/nest-cli.json apps/api/tsconfig*.json ./
COPY infra/deploy/setup.cjs infra/deploy/setup.html ./
RUN pnpm exec prisma generate && pnpm build && mkdir -p logs && chown node logs && install -d -m 0700 -o node -g node /run/epay-setup
USER node
ENV NODE_ENV=production
CMD ["node", "dist/apps/base-system/src/main.js"]

FROM base AS web-build
WORKDIR /project/apps/web
COPY apps/web ./
ENV VITE_SERVICE_BASE_URL=/v1 VITE_HTTP_PROXY=N
RUN pnpm install --frozen-lockfile && pnpm build

FROM nginx:stable-alpine AS web
COPY --from=web-build /project/apps/web/dist /usr/share/nginx/html
COPY infra/deploy/nginx.conf /etc/nginx/conf.d/default.conf

FROM docker:28-cli AS updater
RUN apk add --no-cache python3 ca-certificates
ENV EPAY_UPDATER_CONTAINER=1
COPY infra/deploy/epayctl /usr/local/bin/epayctl
COPY infra/deploy/release-compose.yaml /usr/local/share/epay/compose.pull.yaml
ENTRYPOINT ["python3", "/usr/local/bin/epayctl", "daemon"]

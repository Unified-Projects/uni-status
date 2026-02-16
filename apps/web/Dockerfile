FROM node:25.6.1-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# Development - install and run in one stage
FROM base AS dev
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/shared/package.json ./packages/shared/
COPY packages/auth/package.json ./packages/auth/
COPY packages/database/package.json ./packages/database/
COPY packages/email/package.json ./packages/email/
COPY packages/licensing/package.json ./packages/licensing/
COPY enterprise/package.json ./enterprise/
RUN pnpm install --shamefully-hoist --frozen-lockfile
COPY . .
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "dev"]

# Production build
FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/shared/package.json ./packages/shared/
COPY packages/auth/package.json ./packages/auth/
COPY packages/database/package.json ./packages/database/
COPY packages/email/package.json ./packages/email/
COPY packages/licensing/package.json ./packages/licensing/
COPY enterprise/package.json ./enterprise/
RUN pnpm install --shamefully-hoist --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholder env vars (replaced at runtime via entrypoint)
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV BETTER_AUTH_SECRET="build-time-placeholder-secret-32chars"
ENV UNI_STATUS_URL="http://PLACEHOLDER_UNI_STATUS_URL"
WORKDIR /app/apps/web
RUN pnpm build

# Production
FROM node:25.6.1-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install wget for health checks and create non-root user
RUN apk add --no-cache wget && \
    addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

# Copy entrypoint script
COPY --chown=appuser:appgroup apps/web/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY --from=builder --chown=appuser:appgroup /app/apps/web/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=appuser:appgroup /app/apps/web/public ./apps/web/public

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "apps/web/server.js"]

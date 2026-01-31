FROM node:25.3.0-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# Bun binary for dev runtime
FROM oven/bun:1.3.5-alpine AS bunbase

# Development - install and run in one stage
FROM base AS dev
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/auth/package.json ./packages/auth/
COPY packages/shared/package.json ./packages/shared/
COPY packages/email/package.json ./packages/email/
COPY packages/ui/package.json ./packages/ui/
COPY packages/licensing/package.json ./packages/licensing/
COPY enterprise/package.json ./enterprise/
RUN pnpm install --shamefully-hoist
# Provide bun runtime for dev command
COPY --from=bunbase /usr/local/bin/bun /usr/local/bin/bun
COPY . .
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["pnpm", "dev"]

# Production build - use node for pnpm, copy bun for building
FROM base AS builder
COPY --from=bunbase /usr/local/bin/bun /usr/local/bin/bun
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/auth/package.json ./packages/auth/
COPY packages/shared/package.json ./packages/shared/
COPY packages/email/package.json ./packages/email/
COPY packages/ui/package.json ./packages/ui/
COPY packages/licensing/package.json ./packages/licensing/
COPY enterprise/package.json ./enterprise/
RUN pnpm install --shamefully-hoist
COPY . .
WORKDIR /app/apps/api
RUN bun run build

# Production
FROM oven/bun:1.3.5-alpine AS production
WORKDIR /app

# Install wget for health checks and create non-root user
RUN apk add --no-cache wget && \
    addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

COPY --from=builder --chown=appuser:appgroup /app/apps/api/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/packages ./packages

# Create directories for volume mounts with proper permissions
# These need to exist before volume mount so Docker preserves ownership
RUN mkdir -p /app/reports /app/uploads && \
    chown -R appuser:appgroup /app/reports /app/uploads && \
    chmod 755 /app/reports /app/uploads

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["bun", "run", "dist/index.js"]

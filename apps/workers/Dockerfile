FROM node:25.3.0-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# Bun binary for dev runtime
FROM oven/bun:1.3.5-alpine AS bunbase

# Development - install and run in one stage
FROM base AS dev
# Install Chromium for Puppeteer PDF generation
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/workers/package.json ./apps/workers/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/email/package.json ./packages/email/
COPY packages/ui/package.json ./packages/ui/
COPY packages/licensing/package.json ./packages/licensing/
COPY enterprise/package.json ./enterprise/
RUN pnpm install --shamefully-hoist --frozen-lockfile
# Provide bun runtime for dev command
COPY --from=bunbase /usr/local/bin/bun /usr/local/bin/bun
COPY . .
WORKDIR /app/apps/workers
CMD ["pnpm", "dev"]

# Production build - use node for pnpm, install dependencies
FROM base AS builder
COPY --from=bunbase /usr/local/bin/bun /usr/local/bin/bun
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/workers/package.json ./apps/workers/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/email/package.json ./packages/email/
COPY packages/ui/package.json ./packages/ui/
COPY packages/licensing/package.json ./packages/licensing/
COPY enterprise/package.json ./enterprise/
RUN pnpm install --shamefully-hoist --frozen-lockfile
COPY . .

# Production - run source directly (Bun handles TypeScript/JSX natively)
FROM oven/bun:1.3.5-alpine AS production
WORKDIR /app

# Install Chromium for Puppeteer PDF generation
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

# Copy source and dependencies (no bundling needed - Bun runs TS/JSX directly)
COPY --from=builder --chown=appuser:appgroup /app/apps/workers/src ./apps/workers/src
COPY --from=builder --chown=appuser:appgroup /app/apps/workers/package.json ./apps/workers/
COPY --from=builder --chown=appuser:appgroup /app/apps/workers/tsconfig.json ./apps/workers/
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/packages ./packages

# Create directories for volume mounts with proper permissions
# These need to exist before volume mount so Docker preserves ownership
RUN mkdir -p /app/reports && \
    chown -R appuser:appgroup /app/reports && \
    chmod 755 /app/reports

USER appuser

WORKDIR /app/apps/workers

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD ps aux | grep -v grep | grep -q "bun" || exit 1

CMD ["bun", "run", "src/index.ts"]

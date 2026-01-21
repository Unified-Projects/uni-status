FROM node:25.3.0-alpine AS builder
WORKDIR /app

# Install pnpm directly via npm (avoids corepack signature issues)
RUN npm install -g pnpm@9.15.4

# Copy minimal workspace context needed to build the probe
COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY apps/probe/package.json apps/probe/tsconfig.json ./apps/probe/
COPY apps/probe/src ./apps/probe/src

# Install dependencies and build (no lockfile available for filtered install)
RUN pnpm install --filter @uni-status/probe
RUN pnpm --filter @uni-status/probe build

# ---- Runtime image ----
FROM node:25.3.0-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install pnpm directly via npm (avoids corepack signature issues)
RUN npm install -g pnpm@9.15.4

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

# Copy built artifacts and package manifest
COPY --from=builder --chown=appuser:appgroup /app/apps/probe/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/apps/probe/dist ./dist

# Install runtime dependencies only
RUN pnpm install --prod

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD ps aux | grep -v grep | grep -q "node" || exit 1

CMD ["node", "dist/index.js"]

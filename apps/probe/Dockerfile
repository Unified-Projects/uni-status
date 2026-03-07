FROM node:25.6.1-alpine AS builder
WORKDIR /app

# Install pnpm directly via npm (avoids corepack signature issues)
RUN npm install -g pnpm@9.15.4

# Copy workspace package.json files for dependency resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY apps/probe/package.json apps/probe/tsconfig.json ./apps/probe/
COPY packages/shared/package.json ./packages/shared/
COPY packages/licensing/package.json ./packages/licensing/

# Install all dependencies with hoisting for proper workspace resolution
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy all source code after dependencies are installed
COPY . .

# Build the probe
RUN pnpm --filter @uni-status/probe build

# ---- Runtime image ----
FROM node:25.6.1-alpine
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

# Copy built artifacts and dependencies from builder
COPY --from=builder --chown=appuser:appgroup /app/apps/probe/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/apps/probe/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/packages ./packages

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD ps aux | grep -v grep | grep -q "node" || exit 1

CMD ["node", "dist/index.js"]

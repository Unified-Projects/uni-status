FROM node:20.18.0-bookworm-slim

ENV NODE_ENV=test
WORKDIR /tests

# Tools for waiting on services and logging
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates bash \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm directly via npm (avoids corepack signature issues)
RUN npm install -g pnpm@9.15.4

# Create non-root user directory and set permissions
RUN chown -R node:node /tests

USER node

COPY --chown=node:node tests/package.json ./
COPY --chown=node:node tests/tsconfig.json ./
COPY --chown=node:node tests/vitest.config.ts ./

# No lockfile in tests directory, so cannot use frozen-lockfile
RUN pnpm install

COPY --chown=node:node tests ./

# Copy enterprise tests into the test runner
COPY --chown=node:node enterprise/tests ./enterprise-tests

RUN chmod +x /tests/run-tests.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD pnpm --version || exit 1

CMD ["./run-tests.sh"]

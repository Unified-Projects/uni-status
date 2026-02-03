FROM node:25.6.0-alpine

RUN npm install -g pnpm

WORKDIR /app

# Create non-root user directory
RUN chown -R node:node /app

COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node packages/database/package.json ./packages/database/
COPY --chown=node:node packages/shared/package.json ./packages/shared/
COPY --chown=node:node packages/licensing/package.json ./packages/licensing/

# Create minimal enterprise package.json for db-migrate (only needs database schema deps)
RUN mkdir -p enterprise && echo '{"name":"@uni-status/enterprise","version":"0.1.0","private":true,"type":"module","dependencies":{"@uni-status/database":"workspace:*","@uni-status/shared":"workspace:*"},"peerDependencies":{"drizzle-orm":"^0.44.7"}}' > enterprise/package.json \
  && chown -R node:node enterprise

# Don't use frozen-lockfile since we're creating a minimal enterprise package.json
RUN pnpm install --shamefully-hoist

COPY --chown=node:node packages/database ./packages/database
COPY --chown=node:node packages/shared ./packages/shared
COPY --chown=node:node packages/licensing ./packages/licensing
COPY --chown=node:node enterprise/src/database ./enterprise/src/database

USER node

WORKDIR /app/packages/database

# Run migrations with auto-confirmation
CMD ["sh", "-c", "printf '\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n' | pnpm exec drizzle-kit push --force"]

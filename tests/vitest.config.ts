import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "enterprise-tests/**/*.test.ts",
      "../enterprise/tests/**/*.test.ts",
    ],
    // Exclude tests that require access to source code not available in test container
    // These should be run via `pnpm test` in the development environment
    exclude: [
      "**/node_modules/**",
      "enterprise-tests/unit/**",
      "../enterprise/tests/unit/**",
      // certificate-scheduling.test.ts imports from apps/workers/src which isn't
      // mounted in the test container. Run via `pnpm test` in dev environment.
      "src/workers/certificate-scheduling.test.ts",
    ],
    globals: true,
    environment: "node",
    // Run tests sequentially to avoid race conditions with shared database
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ["basic"],
    setupFiles: ["./src/setup/reset-db.ts", "./src/setup/logging.ts"],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "enterprise-tests/**/*.test.ts",
      "../enterprise/tests/**/*.test.ts",
    ],
    // Exclude only unit/integration fixtures that are not test suites
    exclude: [
      "**/node_modules/**",
      "enterprise-tests/unit/**",
      "../enterprise/tests/unit/**",
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

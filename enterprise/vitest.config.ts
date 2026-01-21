import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
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
    setupFiles: ["./tests/setup.ts"],
    // Coverage configuration
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.ts",
        "src/**/index.ts",
      ],
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
    },
  },
  resolve: {
    alias: {
      "@uni-status/shared": path.resolve(__dirname, "../packages/shared/src"),
      "@uni-status/database": path.resolve(__dirname, "../packages/database/src"),
    },
  },
});

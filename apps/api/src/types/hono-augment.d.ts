import type { LicenseContext } from "@uni-status/enterprise/api/middleware/license";

declare module "hono" {
  interface ContextVariableMap {
    license?: LicenseContext;
  }
}

export {};

import type { LicenseContext } from "../api/middleware/license";

declare module "hono" {
  interface ContextVariableMap {
    license?: LicenseContext;
    auth?: {
      user?: { id: string } | null;
      organizationId?: string | null;
      apiKey?: { id: string; scopes: string[] } | null;
    };
  }
}

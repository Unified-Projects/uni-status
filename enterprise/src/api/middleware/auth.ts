/**
 * Enterprise Auth Middleware Proxy
 *
 * This module provides auth middleware functions that will be injected
 * by the main API application when enterprise routes are registered.
 */

type Context = any;

type AuthMiddleware = {
  requireAuth: (c: Context) => any;
  requireOrganization: (c: Context) => Promise<string>;
  requireRole: (c: Context, roles: Array<"owner" | "admin" | "member" | "viewer">) => Promise<string>;
  requireScope: (c: Context, scope: string) => void;
};

let _authMiddleware: AuthMiddleware | null = null;

export function configureAuthMiddleware(middleware: AuthMiddleware) {
  _authMiddleware = middleware;
}

export function requireAuth(c: Context): any {
  if (!_authMiddleware) {
    throw new Error("Enterprise auth middleware not configured. Call configureAuthMiddleware first.");
  }
  return _authMiddleware.requireAuth(c);
}

export async function requireOrganization(c: Context): Promise<string> {
  if (!_authMiddleware) {
    throw new Error("Enterprise auth middleware not configured. Call configureAuthMiddleware first.");
  }
  return _authMiddleware.requireOrganization(c);
}

export async function requireRole(c: Context, roles: Array<"owner" | "admin" | "member" | "viewer">): Promise<string> {
  if (!_authMiddleware) {
    throw new Error("Enterprise auth middleware not configured. Call configureAuthMiddleware first.");
  }
  return _authMiddleware.requireRole(c, roles);
}

export function requireScope(c: Context, scope: string): void {
  if (!_authMiddleware) {
    throw new Error("Enterprise auth middleware not configured. Call configureAuthMiddleware first.");
  }
  return _authMiddleware.requireScope(c, scope);
}

import { createAuthClient } from "better-auth/react";
import { organizationClient, adminClient, twoFactorClient, genericOAuthClient } from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_UNI_STATUS_URL || "http://localhost:3000",
  plugins: [
    organizationClient(),
    adminClient(),
    twoFactorClient(),
    genericOAuthClient(),
    ssoClient(),
  ],
});

export type AuthClient = typeof authClient;

// Export commonly used methods
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  organization,
} = authClient;

// Helper to sign in with a specific OAuth provider
export async function signInWithOAuth(
  providerId: string,
  options?: { callbackURL?: string }
) {
  return authClient.signIn.social({
    provider: providerId as "github" | "google",
    callbackURL: options?.callbackURL || "/dashboard",
  });
}

"use client";

import { useState, useEffect } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@uni-status/ui";
import { Lock, Shield, Loader2 } from "lucide-react";
import { OAuthProviderButtons } from "@/components/auth";

interface OAuthProvider {
  id: string;
  name: string;
}

interface AuthConfig {
  protectionMode: "none" | "password" | "oauth" | "both";
  oauthMode?: "org_members" | "allowlist" | "any_authenticated";
  allowedEmails?: string[];
  allowedDomains?: string[];
  allowedRoles?: Array<"owner" | "admin" | "member" | "viewer">;
}

interface OAuthGateProps {
  statusPageSlug: string;
  statusPageName: string;
  authConfig: AuthConfig;
  hasPassword: boolean;
  children: React.ReactNode;
}

export function OAuthGate({
  statusPageSlug,
  statusPageName,
  authConfig,
  hasPassword,
  children,
}: OAuthGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if access is required
  const needsAuth = authConfig.protectionMode !== "none";
  const canUsePassword = authConfig.protectionMode === "password" || authConfig.protectionMode === "both";
  const canUseOAuth = authConfig.protectionMode === "oauth" || authConfig.protectionMode === "both";

  useEffect(() => {
    async function checkAccess() {
      if (!needsAuth) {
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }

      // Check for existing access token in cookie/session
      try {
        const response = await fetch(`/api/v1/public/status/${statusPageSlug}/auth-config`);
        const data = await response.json();

        if (data.success && data.data.hasAccess) {
          setIsAuthenticated(true);
        }

        // Fetch OAuth providers if needed
        if (canUseOAuth) {
          const providersResponse = await fetch("/api/v1/auth/sso/providers");
          const providersData = await providersResponse.json();
          if (providersData.success) {
            setProviders(providersData.data);
          }
        }
      } catch (error) {
        console.error("Error checking access:", error);
      } finally {
        setIsLoading(false);
      }
    }

    checkAccess();
  }, [statusPageSlug, needsAuth, canUseOAuth]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/v1/public/status/${statusPageSlug}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        setIsAuthenticated(true);
      } else {
        setPasswordError(data.error?.message || "Incorrect password");
      }
    } catch (error) {
      setPasswordError("Failed to verify password");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--status-muted-text)]" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Show access gate
  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-[var(--status-bg)]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{statusPageName}</CardTitle>
          <CardDescription>
            This status page requires authentication to view
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* OAuth Login */}
          {canUseOAuth && providers.length > 0 && (
            <>
              <OAuthProviderButtons
                providers={providers}
                callbackURL={`/status/${statusPageSlug}`}
                layout="stack"
              />
              {canUsePassword && (
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[var(--status-bg)] px-2 text-[var(--status-muted-text)]">
                      or use password
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Password Login */}
          {canUsePassword && hasPassword && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {passwordError && (
                <div className="rounded-md bg-status-error-bg p-3 text-sm text-status-error-text">
                  {passwordError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--status-muted-text)]" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Access Status Page"
                )}
              </Button>
            </form>
          )}

          {/* OAuth Only Mode with no providers */}
          {canUseOAuth && providers.length === 0 && !canUsePassword && (
            <div className="text-center text-sm text-[var(--status-muted-text)]">
              <p>OAuth authentication is required but no providers are configured.</p>
              <p className="mt-2">Please contact the administrator.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

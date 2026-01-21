"use client";

import { useState } from "react";
import { PasswordForm } from "./password-form";

interface PasswordProtectedPageProps {
  slug: string;
  name: string;
  logo?: string;
  authMode?: string;
  requiresPassword?: boolean;
  requiresOAuth?: boolean;
  providers?: Array<{ id: string; name: string }>;
}

export function PasswordProtectedPage({
  slug,
  name,
  logo,
  authMode,
  requiresPassword,
  requiresOAuth,
  providers,
}: PasswordProtectedPageProps) {
  const [authMethod, setAuthMethod] = useState<"password" | "oauth">("password");

  const handleOAuthLogin = async (providerId: string) => {
    // Redirect to OAuth login endpoint
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    window.location.href = `${appUrl}/api/auth/status-page-oauth?slug=${encodeURIComponent(slug)}&provider=${encodeURIComponent(providerId)}`;
  };

  const showPasswordForm = requiresPassword || authMode === "password";
  const showOAuthSection = requiresOAuth || authMode === "oauth" || authMode === "both";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          {logo && (
            <img
              src={logo}
              alt={name}
              className="mx-auto h-16 w-auto object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== "/icon.svg") {
                  target.src = "/icon.svg";
                }
              }}
            />
          )}
          <h1 className="mt-4 text-2xl font-bold">{name}</h1>
          <p className="mt-2 text-[var(--status-muted-text)]">
            {showPasswordForm && showOAuthSection
              ? "Sign in to view this status page"
              : showPasswordForm
                ? "This status page is password protected"
                : "Sign in to view this status page"}
          </p>
        </div>

        {/* Auth method tabs for "both" mode */}
        {showPasswordForm && showOAuthSection && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAuthMethod("password")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                authMethod === "password"
                  ? "bg-primary text-primary-foreground"
                  : "bg-[var(--status-muted)] text-[var(--status-muted-text)] hover:bg-[var(--status-muted)]/80"
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod("oauth")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                authMethod === "oauth"
                  ? "bg-primary text-primary-foreground"
                  : "bg-[var(--status-muted)] text-[var(--status-muted-text)] hover:bg-[var(--status-muted)]/80"
              }`}
            >
              SSO
            </button>
          </div>
        )}

        {/* Password form */}
        {showPasswordForm && (!showOAuthSection || authMethod === "password") && (
          <PasswordForm slug={slug} />
        )}

        {/* OAuth section */}
        {showOAuthSection && (!showPasswordForm || authMethod === "oauth") && (
          <div className="space-y-3">
            {providers && providers.length > 0 ? (
              providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => handleOAuthLogin(provider.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-md border bg-[var(--status-bg)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--status-muted)] hover:text-[var(--status-text)]"
                >
                  Sign in with {provider.name}
                </button>
              ))
            ) : (
              <p className="text-center text-sm text-[var(--status-muted-text)]">
                No authentication providers configured.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

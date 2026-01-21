"use client";

import { useState, useCallback } from "react";
import { Input, Label, Button } from "@uni-status/ui";
import { authClient } from "@uni-status/auth/client";

interface SSODiscoveryResult {
  hasSSO: boolean;
  ssoRequired?: boolean;
  providerId?: string;
  providerName?: string;
  organizationName?: string;
  redirectUrl?: string;
  autoJoinEnabled?: boolean;
  providerType?: "sso" | "social"; // sso = org-specific, social = global OAuth
  globalProviders?: Array<{ id: string; name: string }>;
}

interface SSOEmailDetectorProps {
  onEmailChange?: (email: string) => void;
  onSSODetected?: (result: SSODiscoveryResult) => void;
  onNoSSO?: () => void;
  onContinueWithEmail?: (email: string) => void;
  autoRedirect?: boolean;
  callbackURL?: string;
  showPasswordField?: boolean;
  password?: string;
  onPasswordChange?: (password: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
  loading?: boolean;
}

export function SSOEmailDetector({
  onEmailChange,
  onSSODetected,
  onNoSSO,
  onContinueWithEmail,
  autoRedirect = false,
  callbackURL = "/dashboard",
  showPasswordField = false,
  password = "",
  onPasswordChange,
  onSubmit,
  loading = false,
}: SSOEmailDetectorProps) {
  const [email, setEmail] = useState("");
  const [checkingSSO, setCheckingSSO] = useState(false);
  const [ssoResult, setSSOResult] = useState<SSODiscoveryResult | null>(null);
  const [checked, setChecked] = useState(false);

  const checkSSO = useCallback(async (emailValue: string) => {
    if (!emailValue || !emailValue.includes("@")) {
      return;
    }

    setCheckingSSO(true);
    try {
      const response = await fetch(
        `/api/v1/auth/sso/discover?email=${encodeURIComponent(emailValue)}`
      );
      const data = await response.json();

      if (data.success) {
        const result = data.data as SSODiscoveryResult;
        setSSOResult(result);
        setChecked(true);

        if (result.hasSSO) {
          onSSODetected?.(result);

          // Auto-redirect if required and configured
          if (autoRedirect && result.ssoRequired && result.providerId) {
            if (result.providerType === "social") {
              // Global OAuth provider (e.g., Microsoft, Google via genericOAuth)
              await authClient.signIn.social({
                provider: result.providerId,
                callbackURL,
              });
            } else {
              // Organization-specific SSO provider (from ssoProvider table)
              await authClient.signIn.sso({
                providerId: result.providerId,
                callbackURL,
              });
            }
          }
        } else {
          onNoSSO?.();
        }
      }
    } catch (error) {
      console.error("SSO discovery failed:", error);
      setSSOResult(null);
      onNoSSO?.();
    } finally {
      setCheckingSSO(false);
    }
  }, [onSSODetected, onNoSSO, autoRedirect, callbackURL]);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setChecked(false);
    setSSOResult(null);
    onEmailChange?.(value);
  };

  const handleEmailBlur = () => {
    if (email && email.includes("@") && !checked) {
      checkSSO(email);
    }
  };

  const handleContinue = async () => {
    if (ssoResult?.hasSSO && ssoResult.providerId) {
      if (ssoResult.providerType === "social") {
        // Global OAuth provider
        await authClient.signIn.social({
          provider: ssoResult.providerId,
          callbackURL,
        });
      } else {
        // Organization-specific SSO provider
        await authClient.signIn.sso({
          providerId: ssoResult.providerId,
          callbackURL,
        });
      }
    } else {
      onContinueWithEmail?.(email);
    }
  };

  const handleSignInWithSSO = async () => {
    if (ssoResult?.providerId) {
      if (ssoResult.providerType === "social") {
        // Global OAuth provider
        await authClient.signIn.social({
          provider: ssoResult.providerId,
          callbackURL,
        });
      } else {
        // Organization-specific SSO provider
        await authClient.signIn.sso({
          providerId: ssoResult.providerId,
          callbackURL,
        });
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={handleEmailChange}
          onBlur={handleEmailBlur}
          disabled={checkingSSO}
        />
      </div>

      {checkingSSO && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
          Checking for SSO...
        </div>
      )}

      {/* Password field - shown when user chooses email/password */}
      {showPasswordField && (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange?.(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      )}

      {checked && ssoResult?.hasSSO && (
        <div className="rounded-lg border bg-blue-50 dark:bg-blue-950 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-blue-600 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div className="flex-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                SSO Available
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {ssoResult.organizationName
                  ? `Sign in with ${ssoResult.providerName} for ${ssoResult.organizationName}`
                  : `Your organization uses ${ssoResult.providerName} for authentication`}
              </p>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleSignInWithSSO}
          >
            Continue with {ssoResult.providerName}
          </Button>

          {!ssoResult.ssoRequired && !showPasswordField && (
            <button
              type="button"
              className="w-full text-sm text-center text-muted-foreground hover:text-foreground"
              onClick={() => onContinueWithEmail?.(email)}
            >
              Or continue with email and password
            </button>
          )}
        </div>
      )}

      {checked && ssoResult && !ssoResult.hasSSO && ssoResult.autoJoinEnabled && (
        <div className="rounded-lg border bg-green-50 dark:bg-green-950 p-3">
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <span>
              You&apos;ll automatically join {ssoResult.organizationName} when you sign up
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

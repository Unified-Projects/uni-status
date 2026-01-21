"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Label, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@uni-status/ui";
import { authClient } from "@uni-status/auth/client";
import { OAuthProviderButtons, AuthDivider, SSOEmailDetector } from "@/components/auth";
import { useSystemStatus } from "@/hooks/use-system-status";
import { useDashboardStore } from "@/stores/dashboard-store";
import { apiClient } from "@/lib/api-client";
import { api } from "@/lib/api";

interface OAuthProvider {
  id: string;
  name: string;
}

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: systemStatus, isLoading: statusLoading } = useSystemStatus();
  const setCurrentOrganization = useDashboardStore((state) => state.setCurrentOrganization);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [ssoDetected, setSSODetected] = useState(false);
  const [autoJoinOrg, setAutoJoinOrg] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Read portalOnly and callbackUrl from query params (for landing page integration)
  const isPortalOnly = searchParams.get("portalOnly") === "true";
  const callbackUrl = searchParams.get("callbackUrl");

  // If the user already has a session, move them to the dashboard
  useEffect(() => {
    let active = true;

    authClient
      .getSession()
      .then((session) => {
        if (!active) return;
        const sessionData = session as any;
        if (sessionData?.user) {
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        // Session lookup failed - continue to registration flow
      })
      .finally(() => {
        if (active) {
          setCheckingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  // Redirect to setup if self-hosted and setup not complete
  useEffect(() => {
    if (checkingSession) return;
    if (!statusLoading && systemStatus) {
      if (systemStatus.isSelfHosted && !systemStatus.setupCompleted) {
        router.push("/setup");
      }
    }
  }, [checkingSession, systemStatus, statusLoading, router]);

  // Fetch enabled OAuth providers
  useEffect(() => {
    if (checkingSession) return;

    async function fetchProviders() {
      try {
        const response = await fetch("/api/v1/auth/sso/providers");
        const data = await response.json();
        if (data.success) {
          setProviders(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch OAuth providers:", error);
      }
    }
    fetchProviders();
  }, [checkingSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name,
      });

      if (result.error) {
        setError(result.error.message ?? "Registration failed");
      } else {
        // If this is a portal-only registration (from landing page), mark user as portal-only
        if (isPortalOnly) {
          try {
            await api("/api/v1/auth/verify-session/mark-portal-only", { method: "POST" });
          } catch {
            // Continue even if this fails - user is registered
            console.warn("Failed to mark user as portal-only");
          }
        }

        // Check if self-hosted with approval mode
        if (systemStatus?.isSelfHosted && systemStatus?.signupMode === "open_with_approval") {
          router.push("/pending-approval");
        } else if (callbackUrl) {
          // Redirect to callback URL (e.g., landing portal)
          window.location.href = callbackUrl;
        } else {
          // Fetch organizations and set the first one as active
          try {
            const orgs = await apiClient.organizations.list();
            if (orgs && orgs.length > 0) {
              setCurrentOrganization(orgs[0].id);
            }
          } catch {
            // Continue even if org fetch fails - dashboard will handle it
          }
          router.push("/dashboard");
        }
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Determine if registration should be shown based on signup mode
  const isInviteOnly = systemStatus?.isSelfHosted && systemStatus?.signupMode === "invite_only";
  const requiresApproval = systemStatus?.isSelfHosted && systemStatus?.signupMode === "open_with_approval";

  const handleSSODetected = (result: {
    hasSSO: boolean;
    ssoRequired?: boolean;
    organizationName?: string;
  }) => {
    setSSODetected(true);
    if (!result.ssoRequired) {
      setShowRegistrationForm(true);
    }
  };

  const handleNoSSO = () => {
    setSSODetected(false);
    setShowRegistrationForm(true);
  };

  const handleContinueWithEmail = (emailValue: string) => {
    setEmail(emailValue);
    setShowRegistrationForm(true);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 flex items-center gap-2">
        <Image src="/icon.svg" alt="Uni-Status" width={48} height={48} />
        <span className="text-2xl font-bold text-[#065f46] dark:text-[#34d399]">Uni-Status</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
          <CardDescription>
            Get started with Uni-Status monitoring
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Invite-only mode notice */}
          {isInviteOnly && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950 p-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="font-medium text-amber-800 dark:text-amber-200">Invitation Required</span>
              </div>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                Registration is by invitation only. Please contact your administrator to receive an invitation.
              </p>
            </div>
          )}

          {/* Approval required notice */}
          {requiresApproval && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-blue-800 dark:text-blue-200">Approval Required</span>
              </div>
              <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                New accounts require administrator approval before access is granted.
              </p>
            </div>
          )}

          {/* OAuth Provider Buttons */}
          {providers.length > 0 && !isInviteOnly && (
            <>
              <OAuthProviderButtons
                providers={providers}
                callbackURL={requiresApproval ? "/pending-approval" : "/dashboard"}
              />
              <AuthDivider text="or continue with email" />
            </>
          )}

          {/* SSO Email Detection */}
          <SSOEmailDetector
            onEmailChange={setEmail}
            onSSODetected={handleSSODetected}
            onNoSSO={handleNoSSO}
            onContinueWithEmail={handleContinueWithEmail}
            callbackURL="/dashboard"
          />

          {/* Registration form (shown after email check or if no SSO) */}
          {showRegistrationForm && !ssoDetected && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              {autoJoinOrg && (
                <div className="rounded-lg border bg-green-50 dark:bg-green-950 p-3">
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                      <path d="M16 3.13a4 4 0 010 7.75"/>
                    </svg>
                    <span>You&apos;ll automatically join {autoJoinOrg}</span>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

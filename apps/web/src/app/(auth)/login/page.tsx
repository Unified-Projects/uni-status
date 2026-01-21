"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@uni-status/ui";
import { authClient } from "@uni-status/auth/client";
import { OAuthProviderButtons, AuthDivider, SSOEmailDetector } from "@/components/auth";
import { useSystemStatus } from "@/hooks/use-system-status";
import { useDashboardStore } from "@/stores/dashboard-store";
import { apiClient } from "@/lib/api-client";

interface OAuthProvider {
  id: string;
  name: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { data: systemStatus, isLoading: statusLoading } = useSystemStatus();
  const setCurrentOrganization = useDashboardStore((state) => state.setCurrentOrganization);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [ssoDetected, setSSODetected] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // If already authenticated, send users straight to the dashboard
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
        // Not logged in or session check failed - allow form to render
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
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Login failed");
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
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSSODetected = (result: { hasSSO: boolean; ssoRequired?: boolean }) => {
    if (result.ssoRequired) {
      setSSODetected(true);
    } else {
      // SSO exists but not required - treat as no SSO for password field display
      setSSODetected(false);
      setShowPasswordField(true);
    }
  };

  const handleNoSSO = () => {
    setSSODetected(false);
    setShowPasswordField(true);
  };

  const handleContinueWithEmail = (emailValue: string) => {
    setEmail(emailValue);
    setShowPasswordField(true);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 flex items-center gap-2">
        <Image src="/icon.svg" alt="Uni-Status" width={48} height={48} />
        <span className="text-2xl font-bold text-[#065f46] dark:text-[#34d399]">Uni-Status</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
          <CardDescription>
            Choose your preferred sign-in method
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* OAuth Provider Buttons */}
          {providers.length > 0 && (
            <>
              <OAuthProviderButtons
                providers={providers}
                callbackURL="/dashboard"
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
            showPasswordField={showPasswordField}
            password={password}
            onPasswordChange={setPassword}
            onSubmit={handleSubmit}
            loading={loading}
          />
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

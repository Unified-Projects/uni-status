"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Card, CardContent, CardDescription, CardHeader, CardTitle, RadioGroup, RadioGroupItem } from "@uni-status/ui";
import { useSystemStatus, useSystemSetup } from "@/hooks/use-system-status";
import { authClient } from "@uni-status/auth/client";
import { useDashboardStore } from "@/stores/dashboard-store";
import type { SignupMode } from "@/lib/api-client";

type SetupStep = "admin" | "organization" | "signup" | "review";

export default function SetupPage() {
  const router = useRouter();
  const { data: systemStatus, isLoading: statusLoading } = useSystemStatus();
  const setupMutation = useSystemSetup();
  const setCurrentOrganization = useDashboardStore((state) => state.setCurrentOrganization);

  const [currentStep, setCurrentStep] = useState<SetupStep>("admin");
  const [error, setError] = useState("");

  // Admin form
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Organization form
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");

  // Signup mode
  const [signupMode, setSignupMode] = useState<SignupMode>("invite_only");

  // Redirect if not self-hosted or setup already complete
  useEffect(() => {
    if (!statusLoading && systemStatus) {
      if (!systemStatus.isSelfHosted) {
        router.push("/register");
      } else if (systemStatus.setupCompleted) {
        router.push("/login");
      }
    }
  }, [systemStatus, statusLoading, router]);

  // Auto-generate slug from organization name
  useEffect(() => {
    if (organizationName) {
      const slug = organizationName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 50);
      setOrganizationSlug(slug);
    }
  }, [organizationName]);

  const validateAdminStep = () => {
    if (!adminName.trim()) {
      setError("Name is required");
      return false;
    }
    if (!adminEmail.trim() || !adminEmail.includes("@")) {
      setError("Valid email is required");
      return false;
    }
    if (adminPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    if (adminPassword !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    return true;
  };

  const validateOrganizationStep = () => {
    if (!organizationName.trim()) {
      setError("Organization name is required");
      return false;
    }
    const slugRegex = /^[a-z0-9-]+$/;
    if (!organizationSlug || !slugRegex.test(organizationSlug) || organizationSlug.length < 3) {
      setError("Slug must be at least 3 characters, lowercase letters, numbers, and hyphens only");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    setError("");

    if (currentStep === "admin") {
      if (validateAdminStep()) {
        setCurrentStep("organization");
      }
    } else if (currentStep === "organization") {
      if (validateOrganizationStep()) {
        setCurrentStep("signup");
      }
    } else if (currentStep === "signup") {
      setCurrentStep("review");
    }
  };

  const handleBack = () => {
    setError("");
    if (currentStep === "organization") {
      setCurrentStep("admin");
    } else if (currentStep === "signup") {
      setCurrentStep("organization");
    } else if (currentStep === "review") {
      setCurrentStep("signup");
    }
  };

  const handleSubmit = async () => {
    setError("");

    try {
      const setupResult = await setupMutation.mutateAsync({
        adminName,
        adminEmail,
        adminPassword,
        organizationName,
        organizationSlug,
        signupMode,
      });

      // Set the organization in the store immediately
      if (setupResult.organizationId) {
        setCurrentOrganization(setupResult.organizationId);
      }

      // Sign in the admin user
      const signInResult = await authClient.signIn.email({
        email: adminEmail,
        password: adminPassword,
      });

      if (signInResult.error) {
        // Setup succeeded but sign-in failed, redirect to login
        router.push("/login");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    }
  };

  if (statusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const signupModeLabels: Record<SignupMode, { title: string; description: string }> = {
    invite_only: {
      title: "Invite Only",
      description: "New users can only join via admin invitation",
    },
    domain_auto_join: {
      title: "Domain Auto-Join",
      description: "Users with configured email domains automatically join",
    },
    open_with_approval: {
      title: "Open with Approval",
      description: "Anyone can sign up but requires admin approval",
    },
  };

  const steps = [
    { id: "admin", label: "Admin" },
    { id: "organization", label: "Organization" },
    { id: "signup", label: "Signup" },
    { id: "review", label: "Review" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="mb-8 flex items-center gap-2">
        <Image src="/icon.svg" alt="Uni-Status" width={48} height={48} />
        <span className="text-2xl font-bold text-[#065f46] dark:text-[#34d399]">Uni-Status</span>
      </div>

      {/* Progress indicator */}
      <div className="mb-6 flex items-center gap-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              index <= currentStepIndex
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {index + 1}
          </div>
        ))}
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Initial Setup</CardTitle>
          <CardDescription>
            {currentStep === "admin" && "Create your admin account"}
            {currentStep === "organization" && "Set up your organization"}
            {currentStep === "signup" && "Configure how users can sign up"}
            {currentStep === "review" && "Review and complete setup"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Admin Account */}
          {currentStep === "admin" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="adminName">Name</Label>
                <Input
                  id="adminName"
                  type="text"
                  placeholder="John Doe"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="admin@example.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminPassword">Password</Label>
                <Input
                  id="adminPassword"
                  type="password"
                  placeholder="At least 8 characters"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </div>
          )}

          {/* Step 2: Organization */}
          {currentStep === "organization" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  type="text"
                  placeholder="Acme Inc"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgSlug">URL Slug</Label>
                <Input
                  id="orgSlug"
                  type="text"
                  placeholder="acme-inc"
                  value={organizationSlug}
                  onChange={(e) => setOrganizationSlug(e.target.value.toLowerCase())}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens only (3-50 characters)
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Signup Mode */}
          {currentStep === "signup" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose how new users can join your organization after setup.
              </p>
              <RadioGroup value={signupMode} onValueChange={(v) => setSignupMode(v as SignupMode)}>
                {(Object.keys(signupModeLabels) as SignupMode[]).map((mode) => (
                  <div key={mode} className="flex items-start space-x-3 rounded-lg border p-4">
                    <RadioGroupItem value={mode} id={mode} className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor={mode} className="font-medium cursor-pointer">
                        {signupModeLabels[mode].title}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {signupModeLabels[mode].description}
                      </p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === "review" && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Admin</div>
                  <div className="font-medium">{adminName}</div>
                  <div className="text-sm">{adminEmail}</div>
                </div>
                <div className="border-t pt-3">
                  <div className="text-sm text-muted-foreground">Organization</div>
                  <div className="font-medium">{organizationName}</div>
                  <div className="text-sm text-muted-foreground">/{organizationSlug}</div>
                </div>
                <div className="border-t pt-3">
                  <div className="text-sm text-muted-foreground">Signup Policy</div>
                  <div className="font-medium">{signupModeLabels[signupMode].title}</div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-2 pt-4">
            {currentStep !== "admin" && (
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Back
              </Button>
            )}
            {currentStep !== "review" ? (
              <Button onClick={handleNext} className="flex-1">
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                className="flex-1"
                disabled={setupMutation.isPending}
              >
                {setupMutation.isPending ? "Setting up..." : "Complete Setup"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@uni-status/ui";
import { authClient } from "@uni-status/auth/client";
import { useSystemStatus, useMyApprovalStatus } from "@/hooks/use-system-status";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export default function SetupOrganisationPage() {
  const router = useRouter();
  const { data: systemStatus, isLoading: statusLoading } = useSystemStatus();
  const { data: approvalStatus, isLoading: approvalLoading } = useMyApprovalStatus();
  const [name, setName] = useState("Personal");
  const [slug, setSlug] = useState("personal");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);

  // In self-hosted mode, only super_admin can create organizations
  // Regular users should be redirected to pending-approval
  useEffect(() => {
    if (statusLoading || approvalLoading) return;

    if (systemStatus?.isSelfHosted) {
      // Check if user has pending approval or was rejected
      if (approvalStatus?.hasPendingApproval || approvalStatus?.status === "pending" || approvalStatus?.status === "rejected") {
        router.replace("/pending-approval");
        return;
      }

      // If user is already a member, they shouldn't be here
      if (approvalStatus?.isOrganizationMember) {
        router.replace("/dashboard");
        return;
      }
    }

    setCheckingPermissions(false);
  }, [systemStatus, statusLoading, approvalStatus, approvalLoading, router]);

  useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(generateSlug(name));
    }
  }, [name, slugManuallyEdited]);

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 50)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await authClient.organization.create({
        name: name.trim(),
        slug: slug.trim(),
      });

      if (result.error) {
        setError(result.error.message ?? "Failed to create organisation");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking permissions in self-hosted mode
  if (checkingPermissions || statusLoading || approvalLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 flex items-center gap-2">
        <Image src="/icon.svg" alt="Uni-Status" width={48} height={48} />
        <span className="text-2xl font-bold text-[#065f46] dark:text-[#34d399]">Uni-Status</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            Create your organisation
          </CardTitle>
          <CardDescription>
            Set up your first organisation to start monitoring your services
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Organisation Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="My Organisation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={1}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug</Label>
              <Input
                id="slug"
                type="text"
                placeholder="my-organisation"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
                minLength={3}
                maxLength={50}
                pattern="[a-z0-9-]+"
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs. Only lowercase letters, numbers, and hyphens.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating organisation..." : "Create organisation"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

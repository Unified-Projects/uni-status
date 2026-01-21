"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@uni-status/ui";
import { useMyApprovalStatus, useSystemStatus } from "@/hooks/use-system-status";
import { authClient, useSession } from "@uni-status/auth/client";

export default function PendingApprovalPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();
  const { data: systemStatus, isLoading: statusLoading } = useSystemStatus();
  const { data: approvalStatus, isLoading: approvalLoading, refetch } = useMyApprovalStatus();
  const [checking, setChecking] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!sessionLoading && !session?.user) {
      router.push("/login");
    }
  }, [session, sessionLoading, router]);

  // Redirect if not self-hosted
  useEffect(() => {
    if (!statusLoading && systemStatus && !systemStatus.isSelfHosted) {
      router.push("/dashboard");
    }
  }, [systemStatus, statusLoading, router]);

  // Check if user has been approved
  useEffect(() => {
    if (approvalStatus) {
      if (approvalStatus.isOrganizationMember) {
        // User is already a member, go to dashboard
        router.push("/dashboard");
      } else if (approvalStatus.status === "approved") {
        // User was approved, go to dashboard
        router.push("/dashboard");
      } else if (approvalStatus.status === "rejected") {
        // User was rejected, show message (handled below)
      }
    }
  }, [approvalStatus, router]);

  // Auto-refresh status every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);

    return () => clearInterval(interval);
  }, [refetch]);

  const handleCheckStatus = async () => {
    setChecking(true);
    await refetch();
    setChecking(false);
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  if (sessionLoading || statusLoading || approvalLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const isRejected = approvalStatus?.status === "rejected";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 flex items-center gap-2">
        <Image src="/icon.svg" alt="Uni-Status" width={48} height={48} />
        <span className="text-2xl font-bold text-[#065f46] dark:text-[#34d399]">Uni-Status</span>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          {isRejected ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <svg
                  className="h-8 w-8 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
              <CardDescription>
                Your request to join has been declined by an administrator.
              </CardDescription>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
                <svg
                  className="h-8 w-8 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <CardTitle className="text-2xl font-bold">Pending Approval</CardTitle>
              <CardDescription>
                Your account is awaiting administrator approval.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isRejected ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
              {approvalStatus?.notes ? (
                <p className="text-muted-foreground">{approvalStatus.notes}</p>
              ) : (
                <p className="text-muted-foreground">
                  Please contact your administrator for more information.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-muted/50 p-4 text-sm text-center">
                <p className="text-muted-foreground">
                  An administrator will review your request and grant access.
                  This page will automatically update when your status changes.
                </p>
              </div>

              {approvalStatus?.requestedAt && (
                <p className="text-xs text-center text-muted-foreground">
                  Request submitted {new Date(approvalStatus.requestedAt).toLocaleDateString()} at{" "}
                  {new Date(approvalStatus.requestedAt).toLocaleTimeString()}
                </p>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={handleCheckStatus}
                disabled={checking}
              >
                {checking ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Checking...
                  </>
                ) : (
                  "Check Status"
                )}
              </Button>
            </>
          )}

          <Button variant="ghost" className="w-full" onClick={handleSignOut}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

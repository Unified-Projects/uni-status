"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Shield,
  Users,
  Check,
  X,
  Clock,
  UserPlus,
  Globe,
  Lock,
  Key,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  RadioGroup,
  RadioGroupItem,
  Label,
  toast,
  Skeleton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@uni-status/ui";
import {
  useSystemStatus,
  useSystemSettings,
  useUpdateSystemSettings,
  usePendingApprovals,
  useApproveUser,
  useRejectUser,
} from "@/hooks/use-system-status";
import { useSession } from "@uni-status/auth/client";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { LicenseSection } from "@uni-status/enterprise/web/components/settings";
import type { SignupMode, PendingApproval } from "@/lib/api-client";

const signupModeOptions: { value: SignupMode; title: string; description: string; icon: typeof Lock }[] = [
  {
    value: "invite_only",
    title: "Invite Only",
    description: "New users can only join via admin invitation",
    icon: Lock,
  },
  {
    value: "domain_auto_join",
    title: "Domain Auto-Join",
    description: "Users with configured email domains automatically join",
    icon: Globe,
  },
  {
    value: "open_with_approval",
    title: "Open with Approval",
    description: "Anyone can sign up but requires admin approval",
    icon: UserPlus,
  },
];

export default function SystemSettingsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();
  const { data: systemStatus, isLoading: statusLoading } = useSystemStatus();
  const { data: settings, isLoading: settingsLoading, error: settingsError, refetch: refetchSettings } = useSystemSettings();
  const { data: pendingApprovals, isLoading: approvalsLoading, refetch: refetchApprovals } = usePendingApprovals();

  const updateSettings = useUpdateSystemSettings();
  const approveUser = useApproveUser();
  const rejectUser = useRejectUser();

  const [selectedSignupMode, setSelectedSignupMode] = useState<SignupMode | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);

  // Initialize signup mode from settings
  useEffect(() => {
    if (settings?.signupMode && !selectedSignupMode) {
      setSelectedSignupMode(settings.signupMode);
    }
  }, [settings, selectedSignupMode]);

  // Redirect non-super-admins
  useEffect(() => {
    if (!sessionLoading && session?.user) {
      // Check if user is super admin via session or settings access
      // The API will return 403 if not super admin, so we handle that via error
    }
  }, [session, sessionLoading]);

  // Redirect if not self-hosted
  useEffect(() => {
    if (!statusLoading && systemStatus && !systemStatus.isSelfHosted) {
      router.push("/settings");
    }
  }, [systemStatus, statusLoading, router]);

  const handleSignupModeChange = async (mode: SignupMode) => {
    setSelectedSignupMode(mode);
    try {
      await updateSettings.mutateAsync({ signupMode: mode });
      toast({
        title: "Settings updated",
        description: `Signup mode changed to ${signupModeOptions.find(o => o.value === mode)?.title}`,
      });
    } catch (error) {
      toast({
        title: "Failed to update settings",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      // Revert to previous value
      setSelectedSignupMode(settings?.signupMode || "invite_only");
    }
  };

  const handleApprove = async (approval: PendingApproval) => {
    try {
      await approveUser.mutateAsync({ id: approval.id });
      toast({
        title: "User approved",
        description: `${approval.user.name || approval.user.email} has been approved and added to the organization`,
      });
      refetchApprovals();
    } catch (error) {
      toast({
        title: "Failed to approve user",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleRejectClick = (approval: PendingApproval) => {
    setSelectedApproval(approval);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!selectedApproval) return;

    try {
      await rejectUser.mutateAsync({ id: selectedApproval.id });
      toast({
        title: "User rejected",
        description: `${selectedApproval.user.name || selectedApproval.user.email}'s request has been rejected`,
      });
      setRejectDialogOpen(false);
      setSelectedApproval(null);
      refetchApprovals();
    } catch (error) {
      toast({
        title: "Failed to reject user",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  if (statusLoading || sessionLoading) {
    return (
      <div className="space-y-6">
        <SystemSettingsHeader />
        <LoadingState variant="card" count={2} />
      </div>
    );
  }

  // Not self-hosted - redirect handled in useEffect
  if (!systemStatus?.isSelfHosted) {
    return null;
  }

  // Check for access error (non super admin)
  if (settingsError) {
    return (
      <div className="space-y-6">
        <SystemSettingsHeader />
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={Shield}
              title="Access Denied"
              description="You don't have permission to access system settings. Only super administrators can access this page."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingCount = pendingApprovals?.filter(a => a.status === "pending").length || 0;

  return (
    <div className="space-y-6">
      <SystemSettingsHeader />

      {/* License Management */}
      <LicenseSection />

      {/* Signup Mode Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Signup Policy
          </CardTitle>
          <CardDescription>
            Configure how new users can join your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <RadioGroup
              value={selectedSignupMode || "invite_only"}
              onValueChange={(value) => handleSignupModeChange(value as SignupMode)}
              disabled={updateSettings.isPending}
            >
              {signupModeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <div
                    key={option.value}
                    className="flex items-start space-x-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor={option.value} className="flex items-center gap-2 font-medium cursor-pointer">
                        <Icon className="h-4 w-4" />
                        {option.title}
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {option.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Pending Approvals
              </CardTitle>
              <CardDescription>
                Users waiting for approval to join the organization
              </CardDescription>
            </div>
            {pendingCount > 0 && (
              <Badge variant="secondary">{pendingCount} pending</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {approvalsLoading ? (
            <LoadingState variant="card" count={3} />
          ) : pendingApprovals && pendingApprovals.length > 0 ? (
            <div className="space-y-4">
              {pendingApprovals.map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {(approval.user.name?.charAt(0) || approval.user.email.charAt(0)).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{approval.user.name || "Unnamed User"}</p>
                      <p className="text-sm text-muted-foreground">{approval.user.email}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        Requested {new Date(approval.requestedAt).toLocaleDateString()} at{" "}
                        {new Date(approval.requestedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {approval.status === "pending" ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRejectClick(approval)}
                          disabled={rejectUser.isPending}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(approval)}
                          disabled={approveUser.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                      </>
                    ) : (
                      <Badge
                        variant={approval.status === "approved" ? "default" : "destructive"}
                      >
                        {approval.status === "approved" ? "Approved" : "Rejected"}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="No pending approvals"
              description={
                selectedSignupMode === "open_with_approval"
                  ? "Users who sign up will appear here for approval"
                  : "Switch to 'Open with Approval' signup mode to allow users to request access"
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject User</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject {selectedApproval?.user.name || selectedApproval?.user.email}'s request to join?
              They will be notified that their request was declined.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setSelectedApproval(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={rejectUser.isPending}
            >
              {rejectUser.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SystemSettingsHeader() {
  return (
    <div>
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Shield className="h-8 w-8" />
        System Settings
      </h1>
      <p className="text-muted-foreground">
        Manage system-wide settings for your self-hosted instance
      </p>
    </div>
  );
}

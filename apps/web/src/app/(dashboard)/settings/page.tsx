"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Key,
  CreditCard,
  AlertTriangle,
  Plus,
  Building2,
  Shield,
  Users,
  Check,
  X,
  Clock,
  UserPlus,
  Globe,
  Lock,
} from "lucide-react";
import {
  Button,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Alert,
  AlertDescription,
  RadioGroup,
  RadioGroupItem,
  Label,
  Skeleton,
  toast,
} from "@uni-status/ui";
import { useSession } from "@uni-status/auth/client";
import { useRouter } from "next/navigation";
import {
  useOrganization,
  useOrganizationMembers,
  useOrganizationApiKeys,
  useUpdateOrganization,
  useCreateApiKey,
  useDeleteApiKey,
  useDeleteOrganization,
} from "@/hooks/use-organizations";
import { useDashboardStore } from "@/stores/dashboard-store";
import {
  ApiKeyCard,
  ApiKeyDialog,
  ApiKeyCreatedDialog,
  OrgSettingsForm,
  DeleteOrgDialog,
  CredentialsForm,
  SSOProvidersForm,
  DomainsForm,
} from "@/components/settings";
import { BillingTab } from "@uni-status/enterprise/web/components/settings";
import { LicenseSection } from "@uni-status/enterprise/web/components/settings";
import { IntegrationsForm } from "@/components/settings/integrations-form";
import { useLicenseStatus } from "@/hooks/use-license-status";
import { MemberRoleBadge, getRolePermissions, type MemberRole } from "@/components/team";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  useSystemStatus,
  useSystemSettings,
  useUpdateSystemSettings,
  usePendingApprovals,
  useApproveUser,
  useRejectUser,
} from "@/hooks/use-system-status";
import type { ApiKey, SignupMode, PendingApproval } from "@/lib/api-client";

const PLAN_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  free: { label: "Free", variant: "secondary" },
  pro: { label: "Pro", variant: "default" },
  enterprise: { label: "Enterprise", variant: "default" },
};

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

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { currentOrganizationId, setCurrentOrganization } = useDashboardStore();
  const { hasFeature, isPaidPlan, plan: licensePlan } = useLicenseStatus();

  // Dialog states
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyCreatedDialogOpen, setApiKeyCreatedDialogOpen] = useState(false);
  const [deleteKeyDialogOpen, setDeleteKeyDialogOpen] = useState(false);
  const [deleteOrgDialogOpen, setDeleteOrgDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);

  // Created key state
  const [createdKey, setCreatedKey] = useState<{ key: string; name: string } | null>(null);

  // System settings state (for self-hosted)
  const [selectedSignupMode, setSelectedSignupMode] = useState<SignupMode | null>(null);

  // Mutations
  const updateOrganization = useUpdateOrganization();
  const createApiKey = useCreateApiKey();
  const deleteApiKey = useDeleteApiKey();
  const deleteOrganization = useDeleteOrganization();
  const updateSystemSettings = useUpdateSystemSettings();
  const approveUser = useApproveUser();
  const rejectUser = useRejectUser();

  // Track action state
  const [actioningKeyId, setActioningKeyId] = useState<string | null>(null);

  // Data fetching
  const {
    data: organization,
    isLoading: orgLoading,
    error: orgError,
    refetch: refetchOrg,
  } = useOrganization(currentOrganizationId || "");

  const {
    data: membersResponse,
    isLoading: membersLoading,
  } = useOrganizationMembers(currentOrganizationId || "");
  const members = membersResponse?.data;

  // System settings (for self-hosted deployments)
  const { data: systemStatus } = useSystemStatus();
  const isSelfHosted = systemStatus?.isSelfHosted ?? false;
  const { data: systemSettings, isLoading: systemSettingsLoading } = useSystemSettings();
  const { data: pendingApprovals, isLoading: approvalsLoading, refetch: refetchApprovals } = usePendingApprovals();
  const canUseIdentityFeatures = hasFeature("sso");
  const canUseApiKeys = isSelfHosted || isPaidPlan;

  const {
    data: apiKeys,
    isLoading: apiKeysLoading,
    error: apiKeysError,
    refetch: refetchApiKeys,
  } = useOrganizationApiKeys(currentOrganizationId || "", { enabled: canUseApiKeys });

  // Initialize signup mode from settings
  useEffect(() => {
    if (systemSettings?.signupMode && !selectedSignupMode) {
      setSelectedSignupMode(systemSettings.signupMode);
    }
  }, [systemSettings, selectedSignupMode]);

  // Determine current user's role
  const currentUserMember = members?.find((m) => m.userId === session?.user?.id);
  const currentUserRole = currentUserMember?.role || "viewer";
  const permissions = getRolePermissions(currentUserRole as MemberRole);

  // Handlers
  const handleOrgSettingsSubmit = async (data: Parameters<typeof OrgSettingsForm>[0] extends { onSubmit: (data: infer T) => unknown } ? T : never) => {
    if (!currentOrganizationId) return;
    await updateOrganization.mutateAsync({
      id: currentOrganizationId,
      data,
    });
  };

  const handleCreateApiKey = async (data: { name: string; scopes: string[]; expiresIn?: number }) => {
    if (!currentOrganizationId) return;
    const result = await createApiKey.mutateAsync({
      orgId: currentOrganizationId,
      data,
    });
    setApiKeyDialogOpen(false);
    // Show the created key dialog
    setCreatedKey({ key: (result as ApiKey & { key: string }).key, name: data.name });
    setApiKeyCreatedDialogOpen(true);
  };

  const handleDeleteKeyClick = (keyId: string) => {
    setKeyToDelete(keyId);
    setDeleteKeyDialogOpen(true);
  };

  const confirmDeleteKey = async () => {
    if (!currentOrganizationId || !keyToDelete) return;
    setActioningKeyId(keyToDelete);
    try {
      await deleteApiKey.mutateAsync({
        orgId: currentOrganizationId,
        keyId: keyToDelete,
      });
      setDeleteKeyDialogOpen(false);
      setKeyToDelete(null);
    } finally {
      setActioningKeyId(null);
    }
  };

  const handleCopyPrefix = async (prefix: string) => {
    try {
      await navigator.clipboard.writeText(prefix);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = prefix;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!currentOrganizationId) return;

    try {
      await deleteOrganization.mutateAsync(currentOrganizationId);
      setDeleteOrgDialogOpen(false);

      // Clear current org from store and redirect
      setCurrentOrganization(null);
      router.push("/dashboard");
    } catch (error) {
      // Error is handled by mutation's error state
      console.error("Failed to delete organization:", error);
    }
  };

  // System settings handlers (for self-hosted)
  const handleSignupModeChange = async (mode: SignupMode) => {
    setSelectedSignupMode(mode);
    try {
      await updateSystemSettings.mutateAsync({ signupMode: mode });
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
      setSelectedSignupMode(systemSettings?.signupMode || "invite_only");
    }
  };

  const handleApproveUser = async (approval: PendingApproval) => {
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

  const pendingCount = pendingApprovals?.filter(a => a.status === "pending").length || 0;

  if (!currentOrganizationId) {
    return (
      <div className="space-y-6">
        <SettingsHeader />
        <EmptyState
          icon={Settings}
          title="No organisation selected"
          description="Please select an organisation from the sidebar to manage settings."
        />
      </div>
    );
  }

  // Use license status plan for accurate display (not the hardcoded org.plan)
  const planInfo = PLAN_LABELS[licensePlan] || PLAN_LABELS.free;

  return (
    <div className="space-y-6">
      <SettingsHeader />

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          {isSelfHosted && (
            <TabsTrigger value="system">
              System
              {pendingCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {canUseIdentityFeatures && <TabsTrigger value="sso">SSO</TabsTrigger>}
          {canUseIdentityFeatures && <TabsTrigger value="domains">Domains</TabsTrigger>}
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          {canUseApiKeys && (
            <TabsTrigger value="api-keys">
              API Keys
              {apiKeys && apiKeys.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {apiKeys.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {!isSelfHosted && <TabsTrigger value="billing">Billing</TabsTrigger>}
          <TabsTrigger value="danger" className="text-destructive data-[state=active]:text-destructive">
            Danger Zone
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Organisation Settings</CardTitle>
                  <CardDescription>
                    Manage your organisation's basic settings
                  </CardDescription>
                </div>
                <Badge variant={planInfo.variant}>{planInfo.label} Plan</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {orgLoading || membersLoading ? (
                <LoadingState variant="card" />
              ) : orgError ? (
                <ErrorState error={orgError} onRetry={() => refetchOrg()} />
              ) : organization ? (
                <OrgSettingsForm
                  organization={organization}
                  onSubmit={handleOrgSettingsSubmit}
                  isSubmitting={updateOrganization.isPending}
                />
              ) : null}
            </CardContent>
          </Card>

          {/* Current user info */}
          <Card>
            <CardHeader>
              <CardTitle>Your Role</CardTitle>
              <CardDescription>Your permissions in this organisation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <MemberRoleBadge role={currentUserRole as MemberRole} showIcon />
                <span className="text-sm text-muted-foreground">
                  {currentUserRole === "owner"
                    ? "Full access to all organisation settings"
                    : currentUserRole === "admin"
                      ? "Can manage team members and settings"
                      : currentUserRole === "member"
                        ? "Can create and manage monitors"
                        : "Read-only access"}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab (self-hosted only) */}
        {isSelfHosted && (
          <TabsContent value="system" className="space-y-6">
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
                {systemSettingsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : (
                  <RadioGroup
                    value={selectedSignupMode || "invite_only"}
                    onValueChange={(value) => handleSignupModeChange(value as SignupMode)}
                    disabled={updateSystemSettings.isPending}
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
                                onClick={() => handleApproveUser(approval)}
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
          </TabsContent>
        )}

        {/* SSO Tab */}
        {canUseIdentityFeatures && (
          <TabsContent value="sso" className="space-y-6">
            <SSOProvidersForm
              organizationId={currentOrganizationId}
              canManage={permissions.canManageSettings}
            />
          </TabsContent>
        )}

        {/* Domains Tab */}
        {canUseIdentityFeatures && (
          <TabsContent value="domains" className="space-y-6">
            <DomainsForm
              organizationId={currentOrganizationId}
              canManage={permissions.canManageSettings}
            />
          </TabsContent>
        )}

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6">
          <IntegrationsForm />
          <CredentialsForm />
        </TabsContent>

        {/* API Keys Tab */}
        {canUseApiKeys && (
          <TabsContent value="api-keys" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">API Keys</h3>
                <p className="text-sm text-muted-foreground">
                  Manage API keys for programmatic access
                </p>
              </div>
              {permissions.canManageSettings && (
                <Button onClick={() => setApiKeyDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create API Key
                </Button>
              )}
            </div>

            {apiKeysLoading ? (
              <LoadingState variant="card" count={2} />
            ) : apiKeysError ? (
              <ErrorState error={apiKeysError} onRetry={() => refetchApiKeys()} />
            ) : apiKeys && apiKeys.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {apiKeys.map((apiKey) => (
                  <ApiKeyCard
                    key={apiKey.id}
                    apiKey={apiKey}
                    onCopy={handleCopyPrefix}
                    onDelete={handleDeleteKeyClick}
                    isDeleting={actioningKeyId === apiKey.id}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Key}
                title="No API keys"
                description="Create an API key to access the Uni-Status API programmatically."
                action={
                  permissions.canManageSettings
                    ? {
                        label: "Create API Key",
                        onClick: () => setApiKeyDialogOpen(true),
                        icon: Plus,
                      }
                    : undefined
                }
              />
            )}
          </TabsContent>
        )}

        {/* Billing Tab (not shown in self-hosted) */}
        {!isSelfHosted && (
          <TabsContent value="billing" className="space-y-4">
            <BillingTab />
          </TabsContent>
        )}

        {/* Danger Zone Tab */}
        <TabsContent value="danger" className="space-y-4">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions for your organisation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                <div>
                  <p className="font-medium">Delete Organisation</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete this organisation and all its data
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteOrgDialogOpen(true)}
                  disabled={!permissions.canDeleteOrganization}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>

              {!permissions.canDeleteOrganization && (
                <p className="text-xs text-muted-foreground">
                  Only organisation owners can delete the organisation.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* API Key Create Dialog */}
      <ApiKeyDialog
        open={apiKeyDialogOpen}
        onOpenChange={setApiKeyDialogOpen}
        onSubmit={handleCreateApiKey}
        isSubmitting={createApiKey.isPending}
      />

      {/* API Key Created Dialog */}
      {createdKey && (
        <ApiKeyCreatedDialog
          open={apiKeyCreatedDialogOpen}
          onOpenChange={(open) => {
            setApiKeyCreatedDialogOpen(open);
            if (!open) setCreatedKey(null);
          }}
          apiKey={createdKey.key}
          keyName={createdKey.name}
        />
      )}

      {/* Delete API Key Confirmation */}
      <Dialog open={deleteKeyDialogOpen} onOpenChange={setDeleteKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this API key? Any applications using
              this key will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteKeyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteKey}
              disabled={deleteApiKey.isPending}
            >
              {deleteApiKey.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      {organization && (
        <DeleteOrgDialog
          open={deleteOrgDialogOpen}
          onOpenChange={setDeleteOrgDialogOpen}
          organizationName={organization.name}
          onConfirm={handleDeleteOrganization}
          isDeleting={deleteOrganization.isPending}
        />
      )}

      {/* Reject User Confirmation Dialog (self-hosted) */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject User</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject {selectedApproval?.user.name || selectedApproval?.user.email}&apos;s request to join?
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

function SettingsHeader() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="text-muted-foreground">
        Manage your organisation settings and preferences
      </p>
    </div>
  );
}

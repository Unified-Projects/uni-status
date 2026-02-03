"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Alert,
  AlertDescription,
  toast,
} from "@uni-status/ui";
import {
  Plus,
  Globe,
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
  Copy,
  Loader2,
  Users,
  Shield,
} from "lucide-react";
import {
  useOrganizationDomains,
  useAddDomain,
  useUpdateDomain,
  useVerifyDomain,
  useDeleteDomain,
  useSSOProviders,
} from "@/hooks/use-sso";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import type { OrganizationDomain, SSOProvider } from "@/lib/api-client";

interface DomainsFormProps {
  organizationId: string;
  canManage: boolean;
}

export function DomainsForm({ organizationId, canManage }: DomainsFormProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDomain, setEditDomain] = useState<OrganizationDomain | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<OrganizationDomain | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ domainId: string; success: boolean; message: string } | null>(null);
  const [newDomainInfo, setNewDomainInfo] = useState<{
    domain: string;
    verificationToken: string;
    instructions: {
      name: string;
      value: string;
    };
  } | null>(null);

  const { data: domains, isLoading, error, refetch } = useOrganizationDomains(organizationId);
  const { data: ssoProviders } = useSSOProviders(organizationId);
  const addDomain = useAddDomain();
  const updateDomain = useUpdateDomain();
  const verifyDomain = useVerifyDomain();
  const deleteDomain = useDeleteDomain();

  const handleAddDomain = async (domain: string) => {
    try {
      const result = await addDomain.mutateAsync({
        orgId: organizationId,
        data: { domain },
      });
      setAddDialogOpen(false);
      // Show verification instructions
      setNewDomainInfo({
        domain: result.domain,
        verificationToken: result.verificationToken || "",
        instructions: {
          name: result.verificationInstructions?.name || "",
          value: result.verificationInstructions?.value || "",
        },
      });
      toast({
        title: "Domain added",
        description: `${domain} has been added. Please verify it to activate.`,
      });
    } catch (error) {
      toast({
        title: "Failed to add domain",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    setVerifyResult(null);
    try {
      const result = await verifyDomain.mutateAsync({
        orgId: organizationId,
        domainId,
      });
      setVerifyResult({
        domainId,
        success: result.verified,
        message: result.message,
      });
      if (result.verified) {
        toast({
          title: "Domain verified",
          description: "Your domain has been successfully verified",
        });
      } else {
        toast({
          title: "Verification incomplete",
          description: result.message || "Domain verification did not complete",
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Verification failed";
      setVerifyResult({
        domainId,
        success: false,
        message: errorMessage,
      });
      toast({
        title: "Verification failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleUpdateDomain = async (domainId: string, data: {
    autoJoinEnabled?: boolean;
    autoJoinRole?: "owner" | "admin" | "member" | "viewer";
    ssoProviderId?: string | null;
    ssoRequired?: boolean;
  }) => {
    try {
      await updateDomain.mutateAsync({
        orgId: organizationId,
        domainId,
        data,
      });
      setEditDomain(null);
      toast({
        title: "Domain updated",
        description: "Domain settings have been saved",
      });
    } catch (error) {
      toast({
        title: "Failed to update domain",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDeleteDomain = async () => {
    if (!domainToDelete) return;
    try {
      await deleteDomain.mutateAsync({
        orgId: organizationId,
        domainId: domainToDelete.id,
      });
      setDeleteDialogOpen(false);
      setDomainToDelete(null);
      toast({
        title: "Domain removed",
        description: `${domainToDelete.domain} has been removed`,
      });
    } catch (error) {
      toast({
        title: "Failed to remove domain",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  };

  if (isLoading) {
    return <LoadingState variant="card" />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Organisation Domains
              </CardTitle>
              <CardDescription>
                Manage email domains for automatic team joining and SSO
              </CardDescription>
            </div>
            {canManage && (
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Domain
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {domains && domains.length > 0 ? (
            <div className="space-y-4">
              {domains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Globe className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{domain.domain}</p>
                        {domain.verified ? (
                          <Badge variant="default" className="bg-green-600">
                            <Check className="mr-1 h-3 w-3" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <AlertCircle className="mr-1 h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {domain.autoJoinEnabled && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            Auto-join as {domain.autoJoinRole}
                          </span>
                        )}
                        {domain.ssoProvider && (
                          <span className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            {domain.ssoProvider.name}
                            {domain.ssoRequired && " (Required)"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {verifyResult?.domainId === domain.id && (
                      <div className="flex items-center gap-1 text-sm">
                        {verifyResult.success ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className={verifyResult.success ? "text-green-600" : "text-red-600"}>
                          {verifyResult.message}
                        </span>
                      </div>
                    )}
                    {canManage && (
                      <>
                        {!domain.verified && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVerifyDomain(domain.id)}
                            disabled={verifyDomain.isPending}
                          >
                            {verifyDomain.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            <span className="ml-1">Verify</span>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditDomain(domain)}
                        >
                          Configure
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDomainToDelete(domain);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Globe}
              title="No domains configured"
              description="Add a domain to enable automatic team joining for users with matching email addresses."
              action={
                canManage
                  ? {
                      label: "Add Domain",
                      onClick: () => setAddDialogOpen(true),
                      icon: Plus,
                    }
                  : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Add Domain Dialog */}
      <AddDomainDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={handleAddDomain}
        isSubmitting={addDomain.isPending}
      />

      {/* Verification Instructions Dialog */}
      <Dialog open={!!newDomainInfo} onOpenChange={() => setNewDomainInfo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Verify Your Domain</DialogTitle>
            <DialogDescription>
              Add the following DNS TXT record to verify ownership of {newDomainInfo?.domain}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Record Type</p>
                <p className="font-mono">TXT</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Name / Host</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-background rounded text-sm break-all">
                    {newDomainInfo?.instructions.name}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(newDomainInfo?.instructions.name || "")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Value</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-background rounded text-sm break-all">
                    {newDomainInfo?.instructions.value}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(newDomainInfo?.instructions.value || "")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                DNS changes can take up to 48 hours to propagate. Once the record is added,
                click &quot;Verify&quot; on the domain to complete verification.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewDomainInfo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Domain Dialog */}
      {editDomain && (
        <EditDomainDialog
          open={!!editDomain}
          onOpenChange={(open) => !open && setEditDomain(null)}
          domain={editDomain}
          ssoProviders={ssoProviders || []}
          onSubmit={(data) => handleUpdateDomain(editDomain.id, data)}
          isSubmitting={updateDomain.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Domain</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{domainToDelete?.domain}&quot;?
              This will disable automatic team joining for users with this email domain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDomain}
              disabled={deleteDomain.isPending}
            >
              {deleteDomain.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Add Domain Dialog Component
function AddDomainDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (domain: string) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [domain, setDomain] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(domain);
    setDomain("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Domain</DialogTitle>
          <DialogDescription>
            Add a domain to enable automatic team joining and SSO for users with matching email addresses
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter the email domain (e.g., example.com, not @example.com)
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !domain}>
              {isSubmitting ? "Adding..." : "Add Domain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Edit Domain Dialog Component
function EditDomainDialog({
  open,
  onOpenChange,
  domain,
  ssoProviders,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: OrganizationDomain;
  ssoProviders: SSOProvider[];
  onSubmit: (data: {
    autoJoinEnabled?: boolean;
    autoJoinRole?: "owner" | "admin" | "member" | "viewer";
    ssoProviderId?: string | null;
    ssoRequired?: boolean;
  }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [autoJoinEnabled, setAutoJoinEnabled] = useState(domain.autoJoinEnabled);
  const [autoJoinRole, setAutoJoinRole] = useState(domain.autoJoinRole);
  const [ssoProviderId, setSSOProviderId] = useState(domain.ssoProvider?.id || "none");
  const [ssoRequired, setSSORequired] = useState(domain.ssoRequired);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      autoJoinEnabled,
      autoJoinRole,
      ssoProviderId: ssoProviderId === "none" ? null : ssoProviderId,
      ssoRequired,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure Domain</DialogTitle>
          <DialogDescription>
            Configure settings for {domain.domain}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="autoJoin">Auto-Join</Label>
              <p className="text-xs text-muted-foreground">
                Automatically add users with this email domain to the organisation
              </p>
            </div>
            <Switch
              id="autoJoin"
              checked={autoJoinEnabled}
              onCheckedChange={setAutoJoinEnabled}
            />
          </div>

          {autoJoinEnabled && (
            <div className="space-y-2">
              <Label htmlFor="autoJoinRole">Default Role</Label>
              <Select value={autoJoinRole} onValueChange={(v) => setAutoJoinRole(v as typeof autoJoinRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The role assigned to users who auto-join
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ssoProvider">SSO Provider</Label>
            <Select value={ssoProviderId} onValueChange={setSSOProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ssoProviders.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Link an SSO provider to this domain
            </p>
          </div>

          {ssoProviderId !== "none" && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="ssoRequired">Require SSO</Label>
                <p className="text-xs text-muted-foreground">
                  Users must authenticate via SSO (password login disabled)
                </p>
              </div>
              <Switch
                id="ssoRequired"
                checked={ssoRequired}
                onCheckedChange={setSSORequired}
              />
            </div>
          )}

          {!domain.verified && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This domain is not verified. SSO and auto-join features will not work
                until the domain is verified via DNS.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

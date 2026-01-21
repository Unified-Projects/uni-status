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
} from "@uni-status/ui";
import {
  Plus,
  Shield,
  Trash2,
  TestTube,
  Check,
  AlertCircle,
  Settings2,
  Loader2,
  X,
  Users,
} from "lucide-react";
import {
  useSSOProviders,
  useCreateSSOProvider,
  useUpdateSSOProvider,
  useDeleteSSOProvider,
  useTestSSOProvider,
} from "@/hooks/use-sso";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import type { SSOProvider, SSOProviderType, GroupRoleMappingConfig, GroupRoleMapping, MemberRole } from "@/lib/api-client";

interface SSOProvidersFormProps {
  organizationId: string;
  canManage: boolean;
}

export function SSOProvidersForm({ organizationId, canManage }: SSOProvidersFormProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<SSOProvider | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<SSOProvider | null>(null);
  const [testResult, setTestResult] = useState<{ providerId: string; status: string; message: string } | null>(null);

  const { data: providers, isLoading, error, refetch } = useSSOProviders(organizationId);
  const createProvider = useCreateSSOProvider();
  const updateProvider = useUpdateSSOProvider();
  const deleteProvider = useDeleteSSOProvider();
  const testProvider = useTestSSOProvider();

  const handleCreateProvider = async (data: {
    name: string;
    type: SSOProviderType;
    providerId: string;
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
  }) => {
    // Build complete OIDC config with all endpoints for Better Auth compatibility
    let oidcConfig = undefined;
    if (data.clientId && data.issuer && data.type === "oidc") {
      // Determine the correct endpoints based on the issuer
      let authEndpoint, tokenEndpoint, userinfoEndpoint, jwksEndpoint;

      if (data.issuer.includes("microsoftonline.com")) {
        // Microsoft Azure AD / Entra ID
        // Issuer should already include /v2.0 from template, but endpoints use base URL
        const msBaseUrl = data.issuer.replace(/\/v2\.0$/, "");
        authEndpoint = `${msBaseUrl}/oauth2/v2.0/authorize`;
        tokenEndpoint = `${msBaseUrl}/oauth2/v2.0/token`;
        userinfoEndpoint = "https://graph.microsoft.com/oidc/userinfo";
        jwksEndpoint = `${msBaseUrl}/discovery/v2.0/keys`;
      } else if (data.issuer.includes("okta.com")) {
        // Okta
        authEndpoint = `${data.issuer}/v1/authorize`;
        tokenEndpoint = `${data.issuer}/v1/token`;
        userinfoEndpoint = `${data.issuer}/v1/userinfo`;
        jwksEndpoint = `${data.issuer}/v1/keys`;
      } else if (data.issuer.includes("auth0.com")) {
        // Auth0
        authEndpoint = `${data.issuer}/authorize`;
        tokenEndpoint = `${data.issuer}/oauth/token`;
        userinfoEndpoint = `${data.issuer}/userinfo`;
        jwksEndpoint = `${data.issuer}/.well-known/jwks.json`;
      } else {
        // Generic OIDC provider - use standard paths
        authEndpoint = `${data.issuer}/authorize`;
        tokenEndpoint = `${data.issuer}/token`;
        userinfoEndpoint = `${data.issuer}/userinfo`;
        jwksEndpoint = `${data.issuer}/.well-known/jwks.json`;
      }

      // Build discovery URL - for Microsoft v2.0, ensure it uses v2.0 path
      let discoveryUrl = `${data.issuer}/.well-known/openid-configuration`;
      if (data.issuer.includes("microsoftonline.com") && !data.issuer.includes("/v2.0")) {
        // Add v2.0 to discovery URL if not already present
        discoveryUrl = `${data.issuer}/v2.0/.well-known/openid-configuration`;
      }

      oidcConfig = {
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        discoveryUrl: discoveryUrl,
        discoveryEndpoint: discoveryUrl,
        authorizationEndpoint: authEndpoint,
        tokenEndpoint: tokenEndpoint,
        userinfoEndpoint: userinfoEndpoint,
        jwksEndpoint: jwksEndpoint,
        scopes: ["openid", "email", "profile"],
      } as any; // Type will be updated
    }

    await createProvider.mutateAsync({
      orgId: organizationId,
      data: {
        name: data.name,
        type: data.type,
        providerId: data.providerId,
        issuer: data.issuer,
        oidcConfig,
      },
    });
    setCreateDialogOpen(false);
  };

  const handleUpdateProvider = async (providerId: string, data: {
    name?: string;
    issuer?: string;
    enabled?: boolean;
    clientId?: string;
    clientSecret?: string;
    groupRoleMapping?: GroupRoleMappingConfig;
  }) => {
    await updateProvider.mutateAsync({
      orgId: organizationId,
      providerId,
      data: {
        name: data.name,
        issuer: data.issuer,
        enabled: data.enabled,
        oidcConfig: data.clientId ? {
          clientId: data.clientId,
          clientSecret: data.clientSecret,
        } : undefined,
        groupRoleMapping: data.groupRoleMapping,
      },
    });
    setEditProvider(null);
  };

  const handleDeleteProvider = async () => {
    if (!providerToDelete) return;
    await deleteProvider.mutateAsync({
      orgId: organizationId,
      providerId: providerToDelete.id,
    });
    setDeleteDialogOpen(false);
    setProviderToDelete(null);
  };

  const handleTestProvider = async (providerId: string) => {
    setTestResult(null);
    try {
      const result = await testProvider.mutateAsync({
        orgId: organizationId,
        providerId,
      });
      setTestResult({ providerId, status: result.status, message: result.message });
    } catch (error) {
      setTestResult({
        providerId,
        status: "error",
        message: error instanceof Error ? error.message : "Connection test failed",
      });
    }
  };

  if (isLoading) {
    return <LoadingState variant="card" />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              SSO Providers
            </CardTitle>
            <CardDescription>
              Configure Single Sign-On providers for your organisation
            </CardDescription>
          </div>
          {canManage && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Provider
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {providers && providers.length > 0 ? (
          <div className="space-y-4">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{provider.name}</p>
                      <Badge variant={provider.enabled ? "default" : "secondary"}>
                        {provider.enabled ? "Active" : "Disabled"}
                      </Badge>
                      <Badge variant="outline">{provider.type.toUpperCase()}</Badge>
                      {provider.groupRoleMapping?.enabled && (
                        <Badge variant="outline" className="text-blue-600 border-blue-600">
                          <Users className="h-3 w-3 mr-1" />
                          Group Roles
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {provider.issuer || provider.providerId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {testResult?.providerId === provider.id && (
                    <div className="flex items-center gap-1 text-sm">
                      {testResult.status === "connected" ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className={testResult.status === "connected" ? "text-green-600" : "text-red-600"}>
                        {testResult.message}
                      </span>
                    </div>
                  )}
                  {canManage && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestProvider(provider.id)}
                        disabled={testProvider.isPending}
                      >
                        {testProvider.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditProvider(provider)}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setProviderToDelete(provider);
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
            icon={Shield}
            title="No SSO providers configured"
            description="Add an SSO provider to enable Single Sign-On for your organisation members."
            action={
              canManage
                ? {
                    label: "Add Provider",
                    onClick: () => setCreateDialogOpen(true),
                    icon: Plus,
                  }
                : undefined
            }
          />
        )}
      </CardContent>

      {/* Create Provider Dialog */}
      <CreateProviderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateProvider}
        isSubmitting={createProvider.isPending}
      />

      {/* Edit Provider Dialog */}
      {editProvider && (
        <EditProviderDialog
          open={!!editProvider}
          onOpenChange={(open) => !open && setEditProvider(null)}
          provider={editProvider}
          onSubmit={(data) => handleUpdateProvider(editProvider.id, data)}
          isSubmitting={updateProvider.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete SSO Provider</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{providerToDelete?.name}&quot;?
              Users who authenticate through this provider will no longer be able to sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProvider}
              disabled={deleteProvider.isPending}
            >
              {deleteProvider.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// SSO Provider Templates for common identity providers
const SSO_PROVIDER_TEMPLATES = {
  microsoft: {
    name: "Microsoft / Azure AD",
    type: "oidc" as const,
    issuerTemplate: "https://login.microsoftonline.com/{tenantId}/v2.0",
    discoveryUrl: "https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration",
    fields: [
      { key: "tenantId", label: "Tenant ID", placeholder: "your-tenant-id-guid", required: true, helpText: "Found in Azure Portal > Azure Active Directory > Overview" }
    ],
  },
  google: {
    name: "Google Workspace",
    type: "oidc" as const,
    issuerTemplate: "https://accounts.google.com",
    discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration",
    fields: [], // No custom fields needed - Google uses standard issuer
  },
  okta: {
    name: "Okta",
    type: "oidc" as const,
    issuerTemplate: "https://{domain}.okta.com",
    discoveryUrl: "https://{domain}.okta.com/.well-known/openid-configuration",
    fields: [
      { key: "domain", label: "Okta Domain", placeholder: "your-company", required: true, helpText: "The subdomain of your Okta URL (e.g., 'acme' for acme.okta.com)" }
    ],
  },
  auth0: {
    name: "Auth0",
    type: "oidc" as const,
    issuerTemplate: "https://{domain}.auth0.com",
    discoveryUrl: "https://{domain}.auth0.com/.well-known/openid-configuration",
    fields: [
      { key: "domain", label: "Auth0 Domain", placeholder: "your-tenant", required: true, helpText: "Your Auth0 tenant name (e.g., 'acme' for acme.auth0.com)" }
    ],
  },
  onelogin: {
    name: "OneLogin",
    type: "oidc" as const,
    issuerTemplate: "https://{subdomain}.onelogin.com/oidc/2",
    discoveryUrl: "https://{subdomain}.onelogin.com/oidc/2/.well-known/openid-configuration",
    fields: [
      { key: "subdomain", label: "OneLogin Subdomain", placeholder: "your-company", required: true, helpText: "Your OneLogin subdomain" }
    ],
  },
  custom: {
    name: "Custom OIDC Provider",
    type: "oidc" as const,
    issuerTemplate: "",
    fields: [],
  },
} as const;

type SSOProviderTemplateKey = keyof typeof SSO_PROVIDER_TEMPLATES;

// Create Provider Dialog Component
function CreateProviderDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    type: SSOProviderType;
    providerId: string;
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [providerTemplate, setProviderTemplate] = useState<SSOProviderTemplateKey>("microsoft");
  const [name, setName] = useState("");
  const [type, setType] = useState<SSOProviderType>("oidc");
  const [providerId, setProviderId] = useState("");
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [templateFields, setTemplateFields] = useState<Record<string, string>>({});

  // Build issuer URL from template and field values
  const buildIssuerUrl = (): string => {
    const template = SSO_PROVIDER_TEMPLATES[providerTemplate];
    if (!template.issuerTemplate) return issuer; // Custom provider uses manual issuer

    let url: string = template.issuerTemplate;
    for (const [key, value] of Object.entries(templateFields)) {
      url = url.replace(`{${key}}`, value);
    }
    return url;
  };

  // Handle template selection change
  const handleTemplateChange = (templateKey: SSOProviderTemplateKey) => {
    setProviderTemplate(templateKey);
    const template = SSO_PROVIDER_TEMPLATES[templateKey];
    setType(template.type);
    setName(template.name === "Custom OIDC Provider" ? "" : template.name);
    setTemplateFields({});
    // Clear issuer if switching to a template that will auto-generate it
    if (templateKey !== "custom") {
      setIssuer("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalIssuer = providerTemplate === "custom" ? issuer : buildIssuerUrl();
    await onSubmit({
      name,
      type,
      providerId: providerId || name.toLowerCase().replace(/\s+/g, "-"),
      issuer: finalIssuer || undefined,
      clientId: clientId || undefined,
      clientSecret: clientSecret || undefined,
    });
    // Reset form
    setName("");
    setType("oidc");
    setProviderId("");
    setProviderTemplate("microsoft");
    setIssuer("");
    setClientId("");
    setClientSecret("");
    setTemplateFields({});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add SSO Provider</DialogTitle>
          <DialogDescription>
            Configure a new Single Sign-On provider for your organisation
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider Template Selector */}
          <div className="space-y-2">
            <Label htmlFor="provider-template">Identity Provider</Label>
            <Select value={providerTemplate} onValueChange={(v) => handleTemplateChange(v as SSOProviderTemplateKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SSO_PROVIDER_TEMPLATES).map(([key, template]) => (
                  <SelectItem key={key} value={key}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display Name</Label>
            <Input
              id="name"
              placeholder="e.g., Company SSO"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Template-specific fields */}
          {SSO_PROVIDER_TEMPLATES[providerTemplate].fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                placeholder={field.placeholder}
                value={templateFields[field.key] || ""}
                onChange={(e) => setTemplateFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                required={field.required}
              />
              {field.helpText && (
                <p className="text-xs text-muted-foreground">{field.helpText}</p>
              )}
            </div>
          ))}

          {/* Show computed issuer URL for templates */}
          {providerTemplate !== "custom" && SSO_PROVIDER_TEMPLATES[providerTemplate].issuerTemplate && (
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <p className="text-sm font-medium">Issuer URL (auto-generated)</p>
              <code className="text-xs text-muted-foreground break-all">
                {buildIssuerUrl() || SSO_PROVIDER_TEMPLATES[providerTemplate].issuerTemplate}
              </code>
            </div>
          )}

          {/* Custom provider: manual issuer URL */}
          {providerTemplate === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="issuer">Issuer URL</Label>
              <Input
                id="issuer"
                placeholder="https://your-idp.example.com"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The OIDC issuer URL for your identity provider
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              placeholder="Your OIDC client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientSecret">Client Secret</Label>
            <Input
              id="clientSecret"
              type="password"
              placeholder="Your OIDC client secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="providerId">Provider ID (optional)</Label>
            <Input
              id="providerId"
              placeholder="unique-provider-id"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A unique identifier for this provider. Auto-generated if left blank.
            </p>
          </div>

          {type === "saml" && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                SAML configuration requires additional setup. After creating the provider,
                you&apos;ll need to configure your Identity Provider with the Service Provider metadata.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name}>
              {isSubmitting ? "Creating..." : "Create Provider"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Edit Provider Dialog Component
function EditProviderDialog({
  open,
  onOpenChange,
  provider,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: SSOProvider;
  onSubmit: (data: {
    name?: string;
    issuer?: string;
    enabled?: boolean;
    clientId?: string;
    clientSecret?: string;
    groupRoleMapping?: GroupRoleMappingConfig;
  }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(provider.name);
  const [issuer, setIssuer] = useState(provider.issuer || "");
  const [enabled, setEnabled] = useState(provider.enabled);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [groupRoleMapping, setGroupRoleMapping] = useState<GroupRoleMappingConfig | null>(
    provider.groupRoleMapping || null
  );
  const [hasGroupRoleMappingChanged, setHasGroupRoleMappingChanged] = useState(false);

  const handleGroupRoleMappingChange = (config: GroupRoleMappingConfig) => {
    setGroupRoleMapping(config);
    setHasGroupRoleMappingChanged(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name: name !== provider.name ? name : undefined,
      issuer: issuer !== provider.issuer ? issuer : undefined,
      enabled: enabled !== provider.enabled ? enabled : undefined,
      clientId: clientId || undefined,
      clientSecret: clientSecret || undefined,
      groupRoleMapping: hasGroupRoleMappingChanged ? (groupRoleMapping || undefined) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit SSO Provider</DialogTitle>
          <DialogDescription>
            Update the configuration for &quot;{provider.name}&quot;
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Provider Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enabled">Enabled</Label>
              <p className="text-xs text-muted-foreground">
                Allow users to authenticate with this provider
              </p>
            </div>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {provider.type === "oidc" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="edit-issuer">Issuer URL</Label>
                <Input
                  id="edit-issuer"
                  placeholder="https://your-domain.okta.com"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-clientId">Client ID (leave blank to keep current)</Label>
                <Input
                  id="edit-clientId"
                  placeholder="Update client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-clientSecret">Client Secret (leave blank to keep current)</Label>
                <Input
                  id="edit-clientSecret"
                  type="password"
                  placeholder="Update client secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
              </div>
            </>
          )}

          <GroupRoleMappingSection
            value={groupRoleMapping}
            onChange={handleGroupRoleMappingChange}
          />

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

// Group Role Mapping Section Component
interface GroupRoleMappingSectionProps {
  value: GroupRoleMappingConfig | null | undefined;
  onChange: (config: GroupRoleMappingConfig) => void;
}

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

function GroupRoleMappingSection({ value, onChange }: GroupRoleMappingSectionProps) {
  const config: GroupRoleMappingConfig = value || {
    enabled: false,
    groupsClaim: "groups",
    mappings: [],
    defaultRole: "member",
    syncOnLogin: false,
  };

  const updateConfig = (updates: Partial<GroupRoleMappingConfig>) => {
    onChange({ ...config, ...updates });
  };

  const addMapping = () => {
    updateConfig({
      mappings: [...config.mappings, { group: "", role: "member" }],
    });
  };

  const removeMapping = (index: number) => {
    updateConfig({
      mappings: config.mappings.filter((_, i) => i !== index),
    });
  };

  const updateMapping = (index: number, updates: Partial<GroupRoleMapping>) => {
    const newMappings = [...config.mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    updateConfig({ mappings: newMappings });
  };

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <Label className="text-base font-medium">Group Role Mapping</Label>
            <p className="text-xs text-muted-foreground">
              Automatically assign roles based on IdP group membership
            </p>
          </div>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(enabled) => updateConfig({ enabled })}
        />
      </div>

      {config.enabled && (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="groupsClaim">Groups Claim Name</Label>
              <Input
                id="groupsClaim"
                placeholder="groups"
                value={config.groupsClaim || ""}
                onChange={(e) => updateConfig({ groupsClaim: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                The claim in the ID token containing group names
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultRole">Default Role</Label>
              <Select
                value={config.defaultRole || "member"}
                onValueChange={(value) => updateConfig({ defaultRole: value as MemberRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Role when no group mapping matches
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label>Sync on Every Login</Label>
              <p className="text-xs text-muted-foreground">
                Update roles on every SSO login (not just first)
              </p>
            </div>
            <Switch
              checked={config.syncOnLogin || false}
              onCheckedChange={(syncOnLogin) => updateConfig({ syncOnLogin })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Group Mappings</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMapping}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Mapping
              </Button>
            </div>

            {config.mappings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No group mappings configured. Add a mapping to assign roles based on groups.
              </p>
            ) : (
              <div className="space-y-2">
                {config.mappings.map((mapping, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="Group name (e.g., admins-*)"
                      value={mapping.group}
                      onChange={(e) => updateMapping(index, { group: e.target.value })}
                      className="flex-1"
                    />
                    <Select
                      value={mapping.role}
                      onValueChange={(value) => updateMapping(index, { role: value as MemberRole })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMapping(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Mappings are evaluated in order. First match wins. Use * as a wildcard.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

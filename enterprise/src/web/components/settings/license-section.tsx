"use client";

import { useState } from "react";
import {
  Shield,
  Key,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ExternalLink,
  Copy,
  Clock,
  User,
  Calendar,
  Zap,
  Activity,
  Users,
  Globe,
  FileText,
  Lock,
  BarChart3,
  Map,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Alert,
  AlertDescription,
  AlertTitle,
  Progress,
  Skeleton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
  Separator,
} from "@uni-status/ui";
import {
  useLicense,
  useActivateLicense,
  useValidateLicense,
  useDeactivateLicense,
  useLicensePortal,
  getPlanDisplayName,
  getLicenseStatusInfo,
  hasFeature,
  type LicenseResponse,
} from "../../hooks/use-license";

export function LicenseSection() {
  const { data: license, isLoading, error, refetch } = useLicense();
  const activateLicense = useActivateLicense();
  const validateLicense = useValidateLicense();
  const deactivateLicense = useDeactivateLicense();
  const { data: portalData } = useLicensePortal();

  const [licenseKey, setLicenseKey] = useState("");
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      toast({
        title: "Invalid license key",
        description: "Please enter a valid license key",
        variant: "destructive",
      });
      return;
    }

    try {
      await activateLicense.mutateAsync({ licenseKey: licenseKey.trim() });
      toast({
        title: "License activated",
        description: "Your license has been successfully activated",
      });
      setLicenseKey("");
    } catch (err) {
      toast({
        title: "Activation failed",
        description: err instanceof Error ? err.message : "Failed to activate license",
        variant: "destructive",
      });
    }
  };

  const handleValidate = async () => {
    try {
      const result = await validateLicense.mutateAsync();
      toast({
        title: result.valid ? "License valid" : "License invalid",
        description: result.detail,
        variant: result.valid ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Validation failed",
        description: err instanceof Error ? err.message : "Failed to validate license",
        variant: "destructive",
      });
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateLicense.mutateAsync();
      toast({
        title: "License deactivated",
        description: "Your license has been deactivated from this instance",
      });
      setDeactivateDialogOpen(false);
    } catch (err) {
      toast({
        title: "Deactivation failed",
        description: err instanceof Error ? err.message : "Failed to deactivate license",
        variant: "destructive",
      });
    }
  };

  const handleCopyMachineId = async () => {
    if (license?.license?.machineId) {
      await navigator.clipboard.writeText(license.license.machineId);
      toast({
        title: "Copied",
        description: "Machine ID copied to clipboard",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center space-y-4">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
            <p className="text-muted-foreground">Failed to load license information</p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusInfo = getLicenseStatusInfo(license?.status || "no_license");
  const hasActiveLicense = license?.hasLicense && license.status === "active";
  const isEnvLicense = (license as any)?.source === "environment";
  // Hide activation form if license exists OR if license is configured via env var
  const showActivationForm = !isEnvLicense && (!license?.hasLicense || license.status === "no_license");

  return (
    <div className="space-y-6">
      {/* License Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                License Status
              </CardTitle>
              <CardDescription>
                Manage your self-hosted Uni-Status license
              </CardDescription>
            </div>
            {license?.hasLicense && (
              <Badge
                variant={
                  statusInfo.color === "green"
                    ? "default"
                    : statusInfo.color === "yellow"
                      ? "secondary"
                      : statusInfo.color === "red"
                        ? "destructive"
                        : "outline"
                }
              >
                {statusInfo.label}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current License Info */}
          {license?.hasLicense && license.license && (
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Zap className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">
                      {getPlanDisplayName(license.plan)} Plan
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {statusInfo.description}
                    </p>
                  </div>
                </div>
                <StatusIcon status={license.status} />
              </div>

              <Separator />

              <LicenseDetails license={license} />

              {license.license.machineId && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Machine ID:</span>
                  <code className="px-2 py-1 bg-muted rounded text-xs font-mono">
                    {license.license.machineId.substring(0, 16)}...
                  </code>
                  <Button variant="ghost" size="sm" onClick={handleCopyMachineId}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  disabled={validateLicense.isPending}
                >
                  {validateLicense.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Validate Now
                </Button>
                {portalData?.url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={portalData.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Manage License
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeactivateDialogOpen(true)}
                >
                  Deactivate
                </Button>
              </div>
            </div>
          )}

          {/* Grace Period Warning */}
          {license?.gracePeriod && license.gracePeriod.status === "active" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Grace Period Active</AlertTitle>
              <AlertDescription>
                Your license has expired. You have {license.gracePeriod.daysRemaining} day(s)
                remaining to renew before being downgraded to the free plan.
                {portalData?.url && (
                  <a
                    href={portalData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 underline font-medium"
                  >
                    Renew now
                  </a>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* License Activation Form */}
          {showActivationForm && (
            <div className="space-y-4">
              <Alert>
                <Key className="h-4 w-4" />
                <AlertTitle>Activate License</AlertTitle>
                <AlertDescription>
                  Enter your license key to unlock premium features. Purchase a license at{" "}
                  <a
                    href="https://status.unified.sh/pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    status.unified.sh
                  </a>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="license-key">License Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="license-key"
                    type="text"
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    className="font-mono"
                  />
                  <Button
                    onClick={handleActivate}
                    disabled={activateLicense.isPending || !licenseKey.trim()}
                  >
                    {activateLicense.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4 mr-2" />
                    )}
                    Activate
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entitlements Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Plan Limits & Features
          </CardTitle>
          <CardDescription>
            Current resource limits and available features for your plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntitlementsDisplay license={license} />
        </CardContent>
      </Card>

      {/* Deactivate Dialog */}
      <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate License</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate your license from this instance?
              You can reactivate it later on this or another instance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={deactivateLicense.isPending}
            >
              {deactivateLicense.isPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <CheckCircle className="h-6 w-6 text-green-500" />;
    case "grace_period":
      return <AlertTriangle className="h-6 w-6 text-yellow-500" />;
    case "expired":
    case "suspended":
    case "downgraded":
      return <XCircle className="h-6 w-6 text-red-500" />;
    default:
      return <AlertTriangle className="h-6 w-6 text-muted-foreground" />;
  }
}

function EntitlementsDisplay({ license }: { license: LicenseResponse | undefined }) {
  if (!license) return null;

  const { entitlements } = license;

  const resourceLimits = [
    {
      name: "Monitors",
      icon: Activity,
      limit: entitlements.monitors,
      description: "Maximum number of monitors",
    },
    {
      name: "Status Pages",
      icon: Globe,
      limit: entitlements.statusPages,
      description: "Maximum number of status pages",
    },
    {
      name: "Team Members",
      icon: Users,
      limit: entitlements.teamMembers,
      description: "Maximum team members per organization",
    },
    {
      name: "Regions",
      icon: Map,
      limit: entitlements.regions,
      description: "Number of monitoring regions",
    },
  ];

  const features = [
    {
      name: "Audit Logs",
      icon: FileText,
      enabled: entitlements.auditLogs,
      description: "Track all user actions",
    },
    {
      name: "SSO",
      icon: Lock,
      enabled: entitlements.sso,
      description: "Single Sign-On integration",
    },
    {
      name: "Custom Roles",
      icon: Shield,
      enabled: entitlements.customRoles,
      description: "Define custom team roles",
    },
    {
      name: "SLO Targets",
      icon: BarChart3,
      enabled: entitlements.slo,
      description: "Service Level Objectives",
    },
    {
      name: "Reports",
      icon: FileText,
      enabled: entitlements.reports,
      description: "Advanced reporting",
    },
    {
      name: "Multi-Region",
      icon: Globe,
      enabled: entitlements.multiRegion,
      description: "Monitor from multiple regions",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Resource Limits */}
      <div>
        <h4 className="text-sm font-medium mb-4">Resource Limits</h4>
        <div className="grid gap-4 md:grid-cols-2">
          {resourceLimits.map((resource) => {
            const Icon = resource.icon;
            const isUnlimited = resource.limit === -1;
            return (
              <div
                key={resource.name}
                className="flex items-center gap-3 p-3 border rounded-lg"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{resource.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isUnlimited ? "Unlimited" : `Up to ${resource.limit}`}
                  </p>
                </div>
                <Badge variant={isUnlimited ? "default" : "secondary"}>
                  {isUnlimited ? "Unlimited" : resource.limit}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>

      {/* Features */}
      <div>
        <h4 className="text-sm font-medium mb-4">Features</h4>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.name}
                className={`flex items-center gap-3 p-3 border rounded-lg ${
                  feature.enabled ? "" : "opacity-50"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    feature.enabled ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                  }`}
                >
                  {feature.enabled ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{feature.name}</p>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Calculate days until a date
 */
function getDaysUntil(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format a date as relative time (e.g., "in 30 days", "2 days ago")
 */
function formatRelativeDate(dateString: string): string {
  const days = getDaysUntil(dateString);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/**
 * Detailed license information display
 */
function LicenseDetails({ license }: { license: LicenseResponse }) {
  if (!license.license) return null;

  const expiresAt = license.license.expiresAt;
  const daysUntilExpiry = expiresAt ? getDaysUntil(expiresAt) : null;

  // Determine expiry status for styling
  const getExpiryStatus = () => {
    if (daysUntilExpiry === null) return "none";
    if (daysUntilExpiry < 0) return "expired";
    if (daysUntilExpiry <= 7) return "critical";
    if (daysUntilExpiry <= 30) return "warning";
    return "healthy";
  };

  const expiryStatus = getExpiryStatus();

  return (
    <div className="space-y-4">
      {/* Primary Info Row */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        {license.license.licenseeName && (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Licensee:</span>
            <span className="font-medium">{license.license.licenseeName}</span>
          </div>
        )}
        {license.license.licenseeEmail && (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Email:</span>
            <span className="font-medium">{license.license.licenseeEmail}</span>
          </div>
        )}
      </div>

      {/* Expiry Information */}
      {expiresAt && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">License Expiry</span>
            </div>
            <Badge
              variant={
                expiryStatus === "expired"
                  ? "destructive"
                  : expiryStatus === "critical"
                    ? "destructive"
                    : expiryStatus === "warning"
                      ? "secondary"
                      : "default"
              }
            >
              {expiryStatus === "expired"
                ? "Expired"
                : expiryStatus === "critical"
                  ? "Expiring Soon"
                  : expiryStatus === "warning"
                    ? "Renew Soon"
                    : "Active"}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {new Date(expiresAt).toLocaleDateString("en-GB", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <span
              className={
                expiryStatus === "expired" || expiryStatus === "critical"
                  ? "text-destructive font-medium"
                  : expiryStatus === "warning"
                    ? "text-yellow-600 dark:text-yellow-400 font-medium"
                    : "text-muted-foreground"
              }
            >
              {daysUntilExpiry !== null && daysUntilExpiry > 0
                ? `${daysUntilExpiry} days remaining`
                : daysUntilExpiry === 0
                  ? "Expires today"
                  : `Expired ${Math.abs(daysUntilExpiry!)} days ago`}
            </span>
          </div>
        </div>
      )}

      {/* Secondary Info Row */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        {license.license.activatedAt && (
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-muted-foreground">Activated:</span>
            <span className="font-medium">
              {new Date(license.license.activatedAt).toLocaleDateString()}
            </span>
          </div>
        )}
        {license.license.createdAt && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Created:</span>
            <span className="font-medium">
              {new Date(license.license.createdAt).toLocaleDateString()}
            </span>
          </div>
        )}
        {license.validation?.lastValidatedAt && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Last validated:</span>
            <span className="font-medium">
              {formatRelativeDate(license.validation.lastValidatedAt)}
            </span>
          </div>
        )}
        {license.source && (
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Source:</span>
            <span className="font-medium capitalize">{license.source}</span>
          </div>
        )}
      </div>
    </div>
  );
}

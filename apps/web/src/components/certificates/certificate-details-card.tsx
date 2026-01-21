"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Lock,
  Key,
  Server,
  Globe,
  HelpCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Separator,
  cn,
} from "@uni-status/ui";
import type { CertificateInfo, CertificateAdditionalDetails } from "@/lib/api-client";

interface CertificateDetailsCardProps {
  certificateInfo: CertificateInfo | null;
  additionalDetails?: CertificateAdditionalDetails | null;
  lastChecked?: string | null;
  checkStatus?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  sslConfig?: {
    expiryWarningDays?: number;
    expiryErrorDays?: number;
    checkChain?: boolean;
    checkHostname?: boolean;
  } | null;
}

function getExpiryStatus(daysUntilExpiry: number | undefined, config?: CertificateDetailsCardProps["sslConfig"]) {
  const warningDays = config?.expiryWarningDays ?? 30;
  const errorDays = config?.expiryErrorDays ?? 7;

  if (daysUntilExpiry === undefined) return "unknown";
  if (daysUntilExpiry <= 0) return "expired";
  if (daysUntilExpiry <= errorDays) return "critical";
  if (daysUntilExpiry <= warningDays) return "warning";
  return "healthy";
}

function ExpiryBadge({
  daysUntilExpiry,
  config,
}: {
  daysUntilExpiry: number | undefined;
  config?: CertificateDetailsCardProps["sslConfig"];
}) {
  const status = getExpiryStatus(daysUntilExpiry, config);

  const variants = {
    expired: { variant: "destructive" as const, icon: XCircle, text: "Expired" },
    critical: { variant: "destructive" as const, icon: AlertTriangle, text: `${daysUntilExpiry} days` },
    warning: { variant: "warning" as const, icon: AlertTriangle, text: `${daysUntilExpiry} days` },
    healthy: { variant: "success" as const, icon: CheckCircle2, text: `${daysUntilExpiry} days` },
    unknown: { variant: "secondary" as const, icon: HelpCircle, text: "Unknown" },
  };

  const { variant, icon: Icon, text } = variants[status];

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {text}
    </Badge>
  );
}

export function CertificateDetailsCard({
  certificateInfo,
  additionalDetails,
  lastChecked,
  checkStatus,
  errorMessage,
  errorCode,
  sslConfig,
}: CertificateDetailsCardProps) {
  const parseBool = (value: boolean | string | undefined) =>
    typeof value === "boolean" ? value : value === "true";
  const altNames: string[] = Array.isArray(additionalDetails?.altNames)
    ? additionalDetails.altNames
    : typeof additionalDetails?.altNames === "string"
    ? additionalDetails.altNames.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  if (!certificateInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Certificate Information
          </CardTitle>
          <CardDescription>SSL/TLS certificate details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mb-4 opacity-50" />
            <p>No certificate information available</p>
            <p className="text-sm mt-1">
              Certificate data will appear after the monitor runs successfully.
            </p>
            {errorMessage && (
              <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <p className="font-medium">Last Error: {errorCode || "Unknown"}</p>
                <p className="mt-1">{errorMessage}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const expiryStatus = getExpiryStatus(certificateInfo.daysUntilExpiry, sslConfig);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className={cn(
                "h-5 w-5",
                expiryStatus === "expired" || expiryStatus === "critical"
                  ? "text-red-500"
                  : expiryStatus === "warning"
                  ? "text-yellow-500"
                  : "text-green-500"
              )} />
              Certificate Information
            </CardTitle>
            <CardDescription>SSL/TLS certificate details</CardDescription>
          </div>
          <ExpiryBadge daysUntilExpiry={certificateInfo.daysUntilExpiry} config={sslConfig} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Expiry Section */}
        <div className={cn(
          "rounded-lg p-4",
          expiryStatus === "expired" || expiryStatus === "critical"
            ? "bg-red-500/10 border border-red-500/20"
            : expiryStatus === "warning"
            ? "bg-yellow-500/10 border border-yellow-500/20"
            : "bg-green-500/10 border border-green-500/20"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4" />
            <span className="font-medium">Expiry Status</span>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Valid From</p>
              <p className="text-sm font-medium">
                {certificateInfo.validFrom
                  ? format(new Date(certificateInfo.validFrom), "MMM d, yyyy HH:mm")
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valid Until</p>
              <p className="text-sm font-medium">
                {certificateInfo.validTo
                  ? format(new Date(certificateInfo.validTo), "MMM d, yyyy HH:mm")
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time Remaining</p>
              <p className={cn(
                "text-sm font-medium",
                expiryStatus === "expired" && "text-red-500",
                expiryStatus === "critical" && "text-red-500",
                expiryStatus === "warning" && "text-yellow-500"
              )}>
                {certificateInfo.daysUntilExpiry !== undefined
                  ? certificateInfo.daysUntilExpiry <= 0
                    ? "Expired"
                    : `${certificateInfo.daysUntilExpiry} days`
                  : "-"}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Certificate Details */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Issuer</span>
            </div>
            <p className="text-sm text-muted-foreground break-all">
              {certificateInfo.issuer || "-"}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Subject</span>
            </div>
            <p className="text-sm text-muted-foreground break-all">
              {certificateInfo.subject || "-"}
            </p>
          </div>
        </div>

        {additionalDetails && (
          <>
            <Separator />

            {/* Technical Details */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Key className="h-4 w-4" />
                Technical Details
              </h4>

              <div className="grid gap-4 md:grid-cols-2">
                {additionalDetails.fingerprint && (
                  <div>
                    <p className="text-xs text-muted-foreground">SHA-256 Fingerprint</p>
                    <p className="text-xs font-mono mt-1 break-all">
                      {additionalDetails.fingerprint}
                    </p>
                  </div>
                )}
                {additionalDetails.serialNumber && (
                  <div>
                    <p className="text-xs text-muted-foreground">Serial Number</p>
                    <p className="text-xs font-mono mt-1 break-all">
                      {additionalDetails.serialNumber}
                    </p>
                  </div>
                )}
                {additionalDetails.protocol && (
                  <div>
                    <p className="text-xs text-muted-foreground">Protocol</p>
                    <p className="text-sm mt-1">{additionalDetails.protocol}</p>
                  </div>
                )}
                {additionalDetails.cipher && (
                  <div>
                    <p className="text-xs text-muted-foreground">Cipher</p>
                    <p className="text-sm mt-1 font-mono">{additionalDetails.cipher}</p>
                  </div>
                )}
              </div>

              {/* Validation Status */}
              <div className="flex flex-wrap gap-3 mt-4">
                {additionalDetails.chainValid !== undefined && (
                  <Badge variant={parseBool(additionalDetails.chainValid) ? "success" : "destructive"} className="gap-1">
                    {parseBool(additionalDetails.chainValid) ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Chain {parseBool(additionalDetails.chainValid) ? "Valid" : "Invalid"}
                  </Badge>
                )}
                {additionalDetails.hostnameValid !== undefined && (
                  <Badge variant={parseBool(additionalDetails.hostnameValid) ? "success" : "destructive"} className="gap-1">
                    {parseBool(additionalDetails.hostnameValid) ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Hostname {parseBool(additionalDetails.hostnameValid) ? "Valid" : "Mismatch"}
                  </Badge>
                )}
                {additionalDetails.chainComplete !== undefined && (
                  <Badge variant={parseBool(additionalDetails.chainComplete) ? "success" : "warning"} className="gap-1">
                    {parseBool(additionalDetails.chainComplete) ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    Chain {parseBool(additionalDetails.chainComplete) ? "Complete" : "Missing Intermediates"}
                  </Badge>
                )}
                {additionalDetails.ocspStapled !== undefined && (
                  <Badge variant={parseBool(additionalDetails.ocspStapled) ? "success" : "warning"} className="gap-1">
                    {parseBool(additionalDetails.ocspStapled) ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    OCSP {parseBool(additionalDetails.ocspStapled) ? "Stapled" : "Not Stapled"}
                  </Badge>
                )}
                {additionalDetails.ocspResponder && (
                  <Badge variant={additionalDetails.ocspResponder === "ok" ? "success" : "warning"} className="gap-1">
                    <Clock className="h-3 w-3" />
                    OCSP {additionalDetails.ocspResponder}
                  </Badge>
                )}
                {additionalDetails.crlStatus && (
                  <Badge variant={additionalDetails.crlStatus === "ok" ? "success" : "warning"} className="gap-1">
                    <Server className="h-3 w-3" />
                    CRL {additionalDetails.crlStatus}
                  </Badge>
                )}
                {additionalDetails.caaStatus && (
                  <Badge variant={additionalDetails.caaStatus === "ok" ? "success" : "warning"} className="gap-1">
                    <Shield className="h-3 w-3" />
                    CAA {additionalDetails.caaStatus}
                  </Badge>
                )}
                {additionalDetails.tlsVersionStatus && (
                  <Badge variant={additionalDetails.tlsVersionStatus === "meets_minimum" ? "success" : "destructive"} className="gap-1">
                    <Lock className="h-3 w-3" />
                    TLS {additionalDetails.tlsVersionStatus}
                  </Badge>
                )}
                {additionalDetails.cipherStatus && (
                  <Badge variant={additionalDetails.cipherStatus === "blocked" ? "destructive" : "success"} className="gap-1">
                    <Key className="h-3 w-3" />
                    Cipher {additionalDetails.cipherStatus}
                  </Badge>
                )}
              </div>

              {/* SANs */}
              {altNames && altNames.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Subject Alternative Names (SANs)</p>
                  <div className="flex flex-wrap gap-1">
                    {altNames.map((san, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {san}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Last Check Info */}
        {lastChecked && (
          <>
            <Separator />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Last checked</span>
              <span>
                {formatDistanceToNow(new Date(lastChecked), { addSuffix: true })}
              </span>
            </div>
          </>
        )}

        {/* Error Display */}
        {errorMessage && checkStatus !== "success" && (
          <>
            <Separator />
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <p className="font-medium">Error: {errorCode || "Unknown"}</p>
              <p className="mt-1">{errorMessage}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

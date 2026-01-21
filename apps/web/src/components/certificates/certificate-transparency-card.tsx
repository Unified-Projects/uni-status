"use client";

import { formatDistanceToNow, format } from "date-fns";
import { AlertTriangle, Bell, CheckCircle2, ShieldAlert, ShieldCheck, Timer } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from "@uni-status/ui";
import type { CertificateTransparencyStatus, CtLogEntry } from "@/lib/api-client";
import { LoadingState } from "@/components/ui/loading-state";

interface CertificateTransparencyCardProps {
  status?: CertificateTransparencyStatus | null;
  recentCertificates?: CtLogEntry[];
  newCertificates?: CtLogEntry[];
  unexpectedCertificates?: CtLogEntry[];
  isLoading?: boolean;
}

const STATE_VARIANTS: Record<
  NonNullable<CertificateTransparencyStatus>["state"],
  { label: string; icon: typeof ShieldCheck; badge: "success" | "warning" | "destructive" | "secondary" }
> = {
  healthy: { label: "No new issuances", icon: ShieldCheck, badge: "success" },
  new: { label: "New certificate issued", icon: Bell, badge: "warning" },
  unexpected: { label: "Unexpected issuer detected", icon: ShieldAlert, badge: "destructive" },
  error: { label: "CT lookup failed", icon: ShieldAlert, badge: "destructive" },
  disabled: { label: "Monitoring disabled", icon: ShieldAlert, badge: "secondary" },
  unknown: { label: "No CT data yet", icon: Timer, badge: "secondary" },
};

export function CertificateTransparencyCard({
  status,
  recentCertificates,
  newCertificates,
  unexpectedCertificates,
  isLoading,
}: CertificateTransparencyCardProps) {
  if (isLoading) {
    return <LoadingState variant="card" count={1} />;
  }

  const stateKey = status?.state ?? "unknown";
  const variant = STATE_VARIANTS[stateKey] ?? STATE_VARIANTS.unknown;
  const Icon = variant.icon;

  const lastChecked = status?.lastChecked ?? status?.checkedAt ?? null;
  const hasNew = (newCertificates?.length ?? 0) > 0;
  const hasUnexpected = (unexpectedCertificates?.length ?? 0) > 0;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            Certificate Transparency
          </CardTitle>
          <CardDescription>Detect new or unexpected certificates issued for this domain</CardDescription>
        </div>
        <Badge variant={variant.badge} className="gap-1 w-fit">
          {variant.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">New certificates</p>
            <p className="text-2xl font-semibold flex items-center gap-2">
              {status?.newCount ?? 0}
              {hasNew && <Badge variant="warning">Attention</Badge>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Unexpected issuers</p>
            <p className="text-2xl font-semibold flex items-center gap-2">
              {status?.unexpectedCount ?? 0}
              {hasUnexpected && <Badge variant="destructive">Investigate</Badge>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last checked</p>
            <p className="text-sm font-medium">
              {lastChecked
                ? formatDistanceToNow(new Date(lastChecked), { addSuffix: true })
                : "Not yet run"}
            </p>
          </div>
        </div>

        {status?.message && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              {status.message}
            </div>
          </div>
        )}

        {(status?.state === "disabled" || stateKey === "disabled") ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            CT monitoring is disabled for this monitor. Enable it in the monitor configuration to watch for new certificates.
          </div>
        ) : (
          <>
            <Separator />

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <p className="font-medium">New certificates</p>
                  </div>
                  <Badge variant="secondary">{newCertificates?.length ?? 0}</Badge>
                </div>
                {newCertificates && newCertificates.length > 0 ? (
                  <div className="space-y-3">
                    {newCertificates.slice(0, 5).map((cert) => (
                      <div key={cert.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">{cert.commonName || cert.dnsNames?.[0] || "Unknown CN"}</p>
                          {cert.loggedAt && (
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(cert.loggedAt), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          Issuer: {cert.issuer || "Unknown issuer"}
                        </p>
                        {cert.notAfter && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Valid until {format(new Date(cert.notAfter), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No new certificates detected since the last run.</p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    <p className="font-medium">Recent CT entries</p>
                  </div>
                  <Badge variant="secondary">{recentCertificates?.length ?? 0}</Badge>
                </div>
                {recentCertificates && recentCertificates.length > 0 ? (
                  <div className="space-y-3">
                    {recentCertificates.slice(0, 6).map((cert) => (
                      <div key={cert.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">{cert.commonName || cert.dnsNames?.[0] || "Unknown CN"}</p>
                          {cert.loggedAt && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(cert.loggedAt), "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          Issuer: {cert.issuer || "Unknown issuer"}
                        </p>
                        {cert.dnsNames && cert.dnsNames.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            SANs: {cert.dnsNames.slice(0, 3).join(", ")}
                            {cert.dnsNames.length > 3 ? "…" : ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Waiting for the first CT crawl.</p>
                )}
              </div>
            </div>

            {unexpectedCertificates && unexpectedCertificates.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <p className="font-medium">Unexpected issuers</p>
                  </div>
                  <div className="space-y-2">
                    {unexpectedCertificates.slice(0, 5).map((cert) => (
                      <div key={cert.id} className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                        <p className="font-semibold text-sm">{cert.issuer || "Unknown issuer"}</p>
                        <p className="text-sm text-muted-foreground">
                          {cert.commonName || cert.dnsNames?.[0] || "Unknown certificate"}
                        </p>
                        {cert.loggedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Logged {formatDistanceToNow(new Date(cert.loggedAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}


"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  cn,
  Separator,
} from "@uni-status/ui";
import type { SecurityHeadersAnalysis, SecurityHeaderResult, SecurityGrade } from "@uni-status/shared/types";

interface SecurityHeadersCardProps {
  securityHeaders: SecurityHeadersAnalysis | null;
  lastChecked?: string | null;
}

// Grade configuration for display
const GRADE_CONFIG: Record<
  SecurityGrade,
  {
    color: string;
    bgColor: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }
> = {
  "A+": {
    color: "text-green-600",
    bgColor: "bg-green-500/10",
    icon: ShieldCheck,
    label: "Excellent",
  },
  A: {
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    icon: ShieldCheck,
    label: "Very Good",
  },
  B: {
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    icon: Shield,
    label: "Good",
  },
  C: {
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    icon: ShieldAlert,
    label: "Fair",
  },
  D: {
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    icon: ShieldAlert,
    label: "Poor",
  },
  F: {
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    icon: ShieldX,
    label: "Critical",
  },
};

// Header configuration
const HEADER_CONFIG: Record<
  string,
  {
    label: string;
    description: string;
    importance: "critical" | "high" | "medium";
  }
> = {
  contentSecurityPolicy: {
    label: "Content-Security-Policy",
    description: "Prevents XSS and data injection attacks",
    importance: "critical",
  },
  strictTransportSecurity: {
    label: "Strict-Transport-Security",
    description: "Enforces HTTPS connections",
    importance: "critical",
  },
  xContentTypeOptions: {
    label: "X-Content-Type-Options",
    description: "Prevents MIME type sniffing",
    importance: "high",
  },
  xFrameOptions: {
    label: "X-Frame-Options",
    description: "Prevents clickjacking attacks",
    importance: "high",
  },
  referrerPolicy: {
    label: "Referrer-Policy",
    description: "Controls referrer information sharing",
    importance: "medium",
  },
  permissionsPolicy: {
    label: "Permissions-Policy",
    description: "Controls browser feature access",
    importance: "medium",
  },
  xXssProtection: {
    label: "X-XSS-Protection",
    description: "Legacy XSS protection (deprecated)",
    importance: "medium",
  },
  hstsPreload: {
    label: "HSTS Preload",
    description: "Domain on HSTS preload list",
    importance: "medium",
  },
};

function getStatusIcon(status: SecurityHeaderResult["status"]) {
  switch (status) {
    case "present":
      return CheckCircle2;
    case "missing":
      return XCircle;
    case "warning":
      return AlertTriangle;
    case "invalid":
      return ShieldQuestion;
    default:
      return HelpCircle;
  }
}

function getStatusColor(status: SecurityHeaderResult["status"]): string {
  switch (status) {
    case "present":
      return "text-green-500";
    case "missing":
      return "text-red-500";
    case "warning":
      return "text-yellow-500";
    case "invalid":
      return "text-orange-500";
    default:
      return "text-muted-foreground";
  }
}

function getStatusBgColor(status: SecurityHeaderResult["status"]): string {
  switch (status) {
    case "present":
      return "bg-green-500/10";
    case "missing":
      return "bg-red-500/10";
    case "warning":
      return "bg-yellow-500/10";
    case "invalid":
      return "bg-orange-500/10";
    default:
      return "bg-muted";
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

function HeaderItem({
  headerKey,
  result,
}: {
  headerKey: string;
  result: SecurityHeaderResult;
}) {
  const config = HEADER_CONFIG[headerKey];
  if (!config) return null;

  const StatusIcon = getStatusIcon(result.status);
  const statusColor = getStatusColor(result.status);
  const bgColor = getStatusBgColor(result.status);

  return (
    <div className={cn("rounded-lg p-3", bgColor)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <StatusIcon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", statusColor)} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{config.label}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs px-1.5 py-0",
                  config.importance === "critical" && "border-red-300 text-red-600",
                  config.importance === "high" && "border-orange-300 text-orange-600",
                  config.importance === "medium" && "border-blue-300 text-blue-600"
                )}
              >
                {config.importance}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {config.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn("text-lg font-bold", getScoreColor(result.score))}>
            {result.score}
          </span>
        </div>
      </div>

      {result.value && (
        <div className="mt-2 pl-6">
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
            {result.value.length > 100 ? `${result.value.slice(0, 100)}...` : result.value}
          </code>
        </div>
      )}

      {result.recommendations && result.recommendations.length > 0 && (
        <div className="mt-2 pl-6 space-y-1">
          {result.recommendations.map((rec, idx) => (
            <p key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0 text-yellow-500" />
              <span>{rec}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function SecurityHeadersCard({
  securityHeaders,
  lastChecked,
}: SecurityHeadersCardProps) {
  if (!securityHeaders) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Headers
          </CardTitle>
          <CardDescription>
            HTTP security header analysis and recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mb-4 opacity-50" />
            <p>No security headers data available</p>
            <p className="text-sm mt-1">
              Enable security headers check in monitor settings to analyze HTTP security headers.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const gradeConfig = GRADE_CONFIG[securityHeaders.grade];
  const GradeIcon = gradeConfig.icon;

  // Get all headers sorted by importance
  const headerEntries = Object.entries(securityHeaders.headers)
    .filter(([_, result]) => result !== undefined)
    .sort(([keyA], [keyB]) => {
      const importanceOrder = { critical: 0, high: 1, medium: 2 };
      const impA = HEADER_CONFIG[keyA]?.importance ?? "medium";
      const impB = HEADER_CONFIG[keyB]?.importance ?? "medium";
      return importanceOrder[impA] - importanceOrder[impB];
    }) as [string, SecurityHeaderResult][];

  // Count by status
  const statusCounts = headerEntries.reduce(
    (acc, [_, result]) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          Security Headers
        </CardTitle>
        <CardDescription>
          HTTP security header analysis and recommendations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Grade */}
        <div className={cn("rounded-lg p-6 text-center", gradeConfig.bgColor)}>
          <div className="flex items-center justify-center gap-3 mb-2">
            <GradeIcon className={cn("h-12 w-12", gradeConfig.color)} />
            <div className="text-left">
              <div className={cn("text-5xl font-bold", gradeConfig.color)}>
                {securityHeaders.grade}
              </div>
              <div className="text-sm text-muted-foreground">
                {gradeConfig.label}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-semibold">
              {securityHeaders.overallScore}
              <span className="text-base text-muted-foreground">/100</span>
            </div>
            <div className="text-sm text-muted-foreground">Overall Score</div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="flex justify-center gap-6 text-sm">
          {statusCounts.present && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>{statusCounts.present} present</span>
            </div>
          )}
          {statusCounts.warning && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>{statusCounts.warning} warnings</span>
            </div>
          )}
          {statusCounts.missing && (
            <div className="flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-red-500" />
              <span>{statusCounts.missing} missing</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Individual Headers */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Header Analysis</h4>
          <div className="space-y-2">
            {headerEntries.map(([key, result]) => (
              <HeaderItem key={key} headerKey={key} result={result} />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-4 pt-4 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>Present</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-yellow-500" />
            <span>Warning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle className="h-3 w-3 text-red-500" />
            <span>Missing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldQuestion className="h-3 w-3 text-orange-500" />
            <span>Invalid</span>
          </div>
        </div>

        {/* Last Check Info */}
        {lastChecked && (
          <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t">
            <span>Last analyzed</span>
            <span>
              {formatDistanceToNow(new Date(lastChecked), { addSuffix: true })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

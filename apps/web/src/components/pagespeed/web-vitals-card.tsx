"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Clock,
  MousePointer,
  Move,
  Gauge,
  Server,
  Timer,
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

interface WebVitals {
  lcp?: number;   // Largest Contentful Paint (ms)
  fid?: number;   // First Input Delay (ms)
  inp?: number;   // Interaction to Next Paint (ms)
  cls?: number;   // Cumulative Layout Shift (unitless)
  fcp?: number;   // First Contentful Paint (ms)
  ttfb?: number;  // Time to First Byte (ms)
  si?: number;    // Speed Index
  tbt?: number;   // Total Blocking Time (ms)
}

interface WebVitalsCardProps {
  webVitals: WebVitals | null;
  lastChecked?: string | null;
}

// Core Web Vitals thresholds based on Google's recommendations
const VITALS_CONFIG: Record<
  keyof WebVitals,
  {
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    unit: string;
    good: number;
    needsImprovement: number;
    isCoreVital: boolean;
    formatValue: (value: number) => string;
  }
> = {
  lcp: {
    label: "LCP",
    description: "Largest Contentful Paint",
    icon: Clock,
    unit: "s",
    good: 2500,
    needsImprovement: 4000,
    isCoreVital: true,
    formatValue: (v) => (v / 1000).toFixed(2),
  },
  fid: {
    label: "FID",
    description: "First Input Delay",
    icon: MousePointer,
    unit: "ms",
    good: 100,
    needsImprovement: 300,
    isCoreVital: true,
    formatValue: (v) => v.toFixed(0),
  },
  inp: {
    label: "INP",
    description: "Interaction to Next Paint",
    icon: MousePointer,
    unit: "ms",
    good: 200,
    needsImprovement: 500,
    isCoreVital: true,
    formatValue: (v) => v.toFixed(0),
  },
  cls: {
    label: "CLS",
    description: "Cumulative Layout Shift",
    icon: Move,
    unit: "",
    good: 0.1,
    needsImprovement: 0.25,
    isCoreVital: true,
    formatValue: (v) => v.toFixed(3),
  },
  fcp: {
    label: "FCP",
    description: "First Contentful Paint",
    icon: Timer,
    unit: "s",
    good: 1800,
    needsImprovement: 3000,
    isCoreVital: false,
    formatValue: (v) => (v / 1000).toFixed(2),
  },
  ttfb: {
    label: "TTFB",
    description: "Time to First Byte",
    icon: Server,
    unit: "ms",
    good: 800,
    needsImprovement: 1800,
    isCoreVital: false,
    formatValue: (v) => v.toFixed(0),
  },
  si: {
    label: "SI",
    description: "Speed Index",
    icon: Gauge,
    unit: "s",
    good: 3400,
    needsImprovement: 5800,
    isCoreVital: false,
    formatValue: (v) => (v / 1000).toFixed(2),
  },
  tbt: {
    label: "TBT",
    description: "Total Blocking Time",
    icon: Activity,
    unit: "ms",
    good: 200,
    needsImprovement: 600,
    isCoreVital: false,
    formatValue: (v) => v.toFixed(0),
  },
};

function getVitalStatus(
  key: keyof WebVitals,
  value: number | undefined
): "good" | "needs-improvement" | "poor" | "unknown" {
  if (value === undefined) return "unknown";

  const config = VITALS_CONFIG[key];
  if (value <= config.good) return "good";
  if (value <= config.needsImprovement) return "needs-improvement";
  return "poor";
}

function getStatusColor(status: "good" | "needs-improvement" | "poor" | "unknown"): string {
  switch (status) {
    case "good":
      return "text-green-500";
    case "needs-improvement":
      return "text-orange-500";
    case "poor":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}

function getStatusBgColor(status: "good" | "needs-improvement" | "poor" | "unknown"): string {
  switch (status) {
    case "good":
      return "bg-green-500/10";
    case "needs-improvement":
      return "bg-orange-500/10";
    case "poor":
      return "bg-red-500/10";
    default:
      return "bg-muted";
  }
}

function VitalMetric({
  vitalKey,
  value,
}: {
  vitalKey: keyof WebVitals;
  value: number | undefined;
}) {
  const config = VITALS_CONFIG[vitalKey];
  const status = getVitalStatus(vitalKey, value);
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-lg p-3",
        getStatusBgColor(status)
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", getStatusColor(status))} />
          <span className="font-medium text-sm">{config.label}</span>
        </div>
        {config.isCoreVital && (
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            Core
          </Badge>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold", getStatusColor(status))}>
          {value !== undefined ? config.formatValue(value) : "-"}
        </span>
        {value !== undefined && config.unit && (
          <span className="text-sm text-muted-foreground">{config.unit}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
    </div>
  );
}

export function WebVitalsCard({ webVitals, lastChecked }: WebVitalsCardProps) {
  if (!webVitals) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Core Web Vitals
          </CardTitle>
          <CardDescription>
            Performance metrics and user experience indicators
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Activity className="h-12 w-12 mb-4 opacity-50" />
            <p>No Web Vitals data available</p>
            <p className="text-sm mt-1">
              Web Vitals data will appear after the monitor runs with PageSpeed enabled.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Separate core vitals from other metrics
  const coreVitals: (keyof WebVitals)[] = ["lcp", "inp", "cls"];
  const otherMetrics: (keyof WebVitals)[] = ["fcp", "ttfb", "si", "tbt"];

  // Check if we have FID instead of INP (older data)
  const hasInp = webVitals.inp !== undefined;
  const hasFid = webVitals.fid !== undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-500" />
          Core Web Vitals
        </CardTitle>
        <CardDescription>
          Performance metrics and user experience indicators
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Core Web Vitals */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            Core Web Vitals
            <Badge variant="secondary" className="text-xs">
              Google Ranking Factor
            </Badge>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <VitalMetric vitalKey="lcp" value={webVitals.lcp} />
            {hasInp ? (
              <VitalMetric vitalKey="inp" value={webVitals.inp} />
            ) : hasFid ? (
              <VitalMetric vitalKey="fid" value={webVitals.fid} />
            ) : (
              <VitalMetric vitalKey="inp" value={undefined} />
            )}
            <VitalMetric vitalKey="cls" value={webVitals.cls} />
          </div>
        </div>

        <Separator />

        {/* Other Performance Metrics */}
        <div>
          <h4 className="text-sm font-medium mb-3">Additional Metrics</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <VitalMetric vitalKey="fcp" value={webVitals.fcp} />
            <VitalMetric vitalKey="ttfb" value={webVitals.ttfb} />
            <VitalMetric vitalKey="si" value={webVitals.si} />
            <VitalMetric vitalKey="tbt" value={webVitals.tbt} />
          </div>
        </div>

        {/* Assessment Legend */}
        <div className="flex flex-wrap justify-center gap-4 pt-4 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Good</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span>Needs Improvement</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Poor</span>
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

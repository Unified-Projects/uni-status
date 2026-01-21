"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Zap,
  Accessibility,
  Shield,
  Search,
  HelpCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@uni-status/ui";

interface PageSpeedScores {
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
}

interface PageSpeedScoreCardProps {
  scores: PageSpeedScores | null;
  strategy?: "mobile" | "desktop";
  lastChecked?: string | null;
  thresholds?: {
    performance?: number;
    accessibility?: number;
    bestPractices?: number;
    seo?: number;
  } | null;
}

function getScoreColor(score: number | undefined): string {
  if (score === undefined) return "text-muted-foreground";
  if (score >= 90) return "text-green-500";
  if (score >= 50) return "text-orange-500";
  return "text-red-500";
}

function getScoreBgColor(score: number | undefined): string {
  if (score === undefined) return "bg-muted";
  if (score >= 90) return "bg-green-500/10";
  if (score >= 50) return "bg-orange-500/10";
  return "bg-red-500/10";
}

function getScoreRingColor(score: number | undefined): string {
  if (score === undefined) return "stroke-muted-foreground";
  if (score >= 90) return "stroke-green-500";
  if (score >= 50) return "stroke-orange-500";
  return "stroke-red-500";
}

function ScoreGauge({
  score,
  label,
  icon: Icon,
  threshold,
}: {
  score: number | undefined;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  threshold?: number;
}) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((score ?? 0) / 100) * circumference;
  const isBelowThreshold = threshold !== undefined && score !== undefined && score < threshold;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="8"
            className="stroke-muted"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className={cn(
              getScoreRingColor(score),
              "transition-all duration-500"
            )}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: score !== undefined ? strokeDashoffset : circumference,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-bold", getScoreColor(score))}>
            {score !== undefined ? score : "-"}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <Icon className={cn("h-4 w-4", getScoreColor(score))} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {isBelowThreshold && (
        <span className="text-xs text-orange-500 mt-1">
          Below {threshold} threshold
        </span>
      )}
    </div>
  );
}

export function PageSpeedScoreCard({
  scores,
  strategy = "mobile",
  lastChecked,
  thresholds,
}: PageSpeedScoreCardProps) {
  if (!scores) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Lighthouse Scores
          </CardTitle>
          <CardDescription>
            Google PageSpeed Insights analysis ({strategy})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Zap className="h-12 w-12 mb-4 opacity-50" />
            <p>No PageSpeed data available</p>
            <p className="text-sm mt-1">
              PageSpeed data will appear after the monitor runs with PageSpeed enabled.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Lighthouse Scores
            </CardTitle>
            <CardDescription>
              Google PageSpeed Insights analysis ({strategy})
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <ScoreGauge
            score={scores.performance}
            label="Performance"
            icon={Zap}
            threshold={thresholds?.performance}
          />
          <ScoreGauge
            score={scores.accessibility}
            label="Accessibility"
            icon={Accessibility}
            threshold={thresholds?.accessibility}
          />
          <ScoreGauge
            score={scores.bestPractices}
            label="Best Practices"
            icon={Shield}
            threshold={thresholds?.bestPractices}
          />
          <ScoreGauge
            score={scores.seo}
            label="SEO"
            icon={Search}
            threshold={thresholds?.seo}
          />
        </div>

        {/* Score Legend */}
        <div className="flex flex-wrap justify-center gap-4 pt-4 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>90-100 (Good)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span>50-89 (Needs Improvement)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>0-49 (Poor)</span>
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

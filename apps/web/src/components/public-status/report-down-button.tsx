"use client";

import { useState } from "react";
import { Button } from "@uni-status/ui";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@uni-status/ui";

interface ReportDownButtonProps {
  statusPageSlug: string;
  monitorId: string;
  reportCount?: number;
  threshold?: number;
  className?: string;
}

export function ReportDownButton({
  statusPageSlug,
  monitorId,
  reportCount = 0,
  threshold = 30,
  className,
}: ReportDownButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCount, setCurrentCount] = useState(reportCount);

  const handleReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/public/status-pages/${statusPageSlug}/report-down`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ monitorId }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        if (data.error?.code === "RATE_LIMIT") {
          setError("Too many reports. Please try again later.");
        } else if (data.error?.code === "DISABLED") {
          setError("Reporting is not enabled.");
        } else {
          setError(data.error?.message || "Failed to submit report");
        }
        return;
      }

      setHasReported(true);
      if (data.data?.reportCount) {
        setCurrentCount(data.data.reportCount);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (hasReported) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-[var(--status-muted-text)]",
          className
        )}
      >
        <CheckCircle className="h-3 w-3 text-status-success-solid" />
        <span>Thanks for reporting</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleReport}
        disabled={isLoading}
        className="h-auto py-1 px-2 text-xs text-[var(--status-muted-text)] hover:text-[var(--status-text)]"
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <AlertTriangle className="h-3 w-3 mr-1" />
        )}
        Is this down for you?
      </Button>
      {currentCount > 0 && (
        <span className="text-[10px] text-[var(--status-muted-text)] text-center">
          {currentCount} {currentCount === 1 ? "report" : "reports"}
        </span>
      )}
      {error && (
        <span className="text-[10px] text-status-error-solid text-center">{error}</span>
      )}
    </div>
  );
}

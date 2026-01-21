"use client";

import { AlertTriangle, X, ExternalLink, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { Button, cn } from "@uni-status/ui";
import { useLicense, useLicensePortal } from "../../hooks/use-license";
import { useBillingLicense, useBillingPortal } from "../../hooks/use-billing";

interface GracePeriodBannerProps {
  isSelfHosted: boolean;
}

export function GracePeriodBanner({ isSelfHosted }: GracePeriodBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  // Use the appropriate hooks based on deployment mode
  const selfHostedLicense = useLicense();
  const hostedLicense = useBillingLicense();
  const selfHostedPortal = useLicensePortal();
  const hostedPortal = useBillingPortal();

  const license = isSelfHosted ? selfHostedLicense.data : hostedLicense.data;
  const portalUrl = isSelfHosted ? selfHostedPortal.data?.url : hostedPortal.data?.url;

  // Reset dismissed state if grace period changes
  useEffect(() => {
    if (license?.gracePeriod?.daysRemaining) {
      // Only reset if days changed significantly (new grace period)
      const storageKey = `grace-period-dismissed-${license.gracePeriod.endsAt}`;
      const wasDismissed = sessionStorage.getItem(storageKey);
      setIsDismissed(!!wasDismissed);
    }
  }, [license?.gracePeriod?.endsAt]);

  // Don't show if not in grace period
  if (!license?.gracePeriod || license.gracePeriod.status !== "active") {
    return null;
  }

  // Don't show if user dismissed
  if (isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    const storageKey = `grace-period-dismissed-${license.gracePeriod!.endsAt}`;
    sessionStorage.setItem(storageKey, "true");
    setIsDismissed(true);
  };

  const daysRemaining = license.gracePeriod.daysRemaining;
  const isUrgent = daysRemaining <= 1;
  const isWarning = daysRemaining <= 3;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3 text-sm",
        isUrgent
          ? "bg-red-600 text-white"
          : isWarning
            ? "bg-yellow-500 text-yellow-950"
            : "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200"
      )}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className={cn("h-5 w-5 shrink-0", isUrgent && "animate-pulse")} />
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {isUrgent
              ? "Final warning:"
              : isWarning
                ? "Urgent:"
                : "Notice:"}
          </span>
          <span>
            {isSelfHosted
              ? "Your license has expired."
              : "Your subscription has payment issues."}
            {" "}
            {daysRemaining === 0 ? (
              <span className="font-bold">This is your last day</span>
            ) : daysRemaining === 1 ? (
              <span className="font-bold">1 day remaining</span>
            ) : (
              <span className="font-bold">{daysRemaining} days remaining</span>
            )}
            {" "}before your account is downgraded to the free plan.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {portalUrl && (
          <Button
            variant={isUrgent ? "secondary" : "outline"}
            size="sm"
            asChild
            className={cn(
              isUrgent && "bg-white text-red-600 hover:bg-gray-100",
              isWarning && !isUrgent && "border-yellow-800 text-yellow-900 hover:bg-yellow-200"
            )}
          >
            <a href={portalUrl} target="_blank" rel="noopener noreferrer">
              {isSelfHosted ? "Renew License" : "Update Payment"}
              <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className={cn(
            "p-1 h-auto",
            isUrgent && "text-white hover:bg-red-700",
            isWarning && !isUrgent && "text-yellow-800 hover:bg-yellow-400/50"
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Downgrade notice banner shown after grace period expires
 */
export function DowngradeBanner({ isSelfHosted }: GracePeriodBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  const selfHostedLicense = useLicense();
  const hostedLicense = useBillingLicense();
  const selfHostedPortal = useLicensePortal();
  const hostedPortal = useBillingPortal();

  const license = isSelfHosted ? selfHostedLicense.data : hostedLicense.data;
  const portalUrl = isSelfHosted ? selfHostedPortal.data?.url : hostedPortal.data?.url;

  // Don't show if not downgraded
  if (license?.status !== "downgraded") {
    return null;
  }

  // Don't show if user dismissed
  if (isDismissed) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm bg-muted border-b">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span>
          Your account has been downgraded to the free plan due to{" "}
          {isSelfHosted ? "license expiration" : "payment issues"}.
          Some features may be limited.
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {portalUrl && (
          <Button variant="default" size="sm" asChild>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer">
              {isSelfHosted ? "Get License" : "Resubscribe"}
              <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsDismissed(true)}
          className="p-1 h-auto"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Combined banner that shows appropriate message based on license status
 */
export function LicenseStatusBanner({ isSelfHosted }: GracePeriodBannerProps) {
  const selfHostedLicense = useLicense();
  const hostedLicense = useBillingLicense();

  const license = isSelfHosted ? selfHostedLicense.data : hostedLicense.data;
  const isLoading = isSelfHosted ? selfHostedLicense.isLoading : hostedLicense.isLoading;

  // Don't render anything while loading
  if (isLoading) {
    return null;
  }

  // Show appropriate banner based on status
  if (license?.gracePeriod?.status === "active") {
    return <GracePeriodBanner isSelfHosted={isSelfHosted} />;
  }

  if (license?.status === "downgraded") {
    return <DowngradeBanner isSelfHosted={isSelfHosted} />;
  }

  return null;
}

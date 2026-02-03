"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch,
  Label,
  Input,
  Button,
  Separator,
  toast,
} from "@uni-status/ui";
import { MessageSquareWarning, Users, Clock, Shield, Zap, Save, Loader2 } from "lucide-react";
import { useCrowdsourcedSettings, useUpdateCrowdsourcedSettings } from "@/hooks/use-status-pages";
import { LoadingState } from "@/components/ui/loading-state";

interface CrowdsourcedSettingsCardProps {
  statusPageId: string;
}

export function CrowdsourcedSettingsCard({ statusPageId }: CrowdsourcedSettingsCardProps) {
  const { data: settings, isLoading, error } = useCrowdsourcedSettings(statusPageId);
  const updateSettings = useUpdateCrowdsourcedSettings();

  const [enabled, setEnabled] = useState(false);
  const [reportThreshold, setReportThreshold] = useState(30);
  const [timeWindowMinutes, setTimeWindowMinutes] = useState(15);
  const [rateLimitPerIp, setRateLimitPerIp] = useState(5);
  const [autoDegradeEnabled, setAutoDegradeEnabled] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local state with fetched settings
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setReportThreshold(settings.reportThreshold);
      setTimeWindowMinutes(settings.timeWindowMinutes);
      setRateLimitPerIp(settings.rateLimitPerIp);
      setAutoDegradeEnabled(settings.autoDegradeEnabled);
      setHasChanges(false);
    }
  }, [settings]);

  // Track changes (excluding enabled since it auto-saves)
  useEffect(() => {
    if (settings) {
      const changed =
        reportThreshold !== settings.reportThreshold ||
        timeWindowMinutes !== settings.timeWindowMinutes ||
        rateLimitPerIp !== settings.rateLimitPerIp ||
        autoDegradeEnabled !== settings.autoDegradeEnabled;
      setHasChanges(changed);
    }
  }, [reportThreshold, timeWindowMinutes, rateLimitPerIp, autoDegradeEnabled, settings]);

  // Handle enabled toggle - auto-save immediately
  const handleEnabledChange = async (newEnabled: boolean) => {
    const previousEnabled = enabled;
    setEnabled(newEnabled);
    try {
      await updateSettings.mutateAsync({
        statusPageId,
        data: { enabled: newEnabled },
      });
      toast({
        title: "Settings updated",
        description: `Crowdsourced reporting ${newEnabled ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      setEnabled(previousEnabled);
      toast({
        title: "Failed to update settings",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        statusPageId,
        data: {
          enabled,
          reportThreshold,
          timeWindowMinutes,
          rateLimitPerIp,
          autoDegradeEnabled,
        },
      });
      toast({
        title: "Settings saved",
        description: "Crowdsourced reporting settings have been updated",
      });
    } catch (error) {
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5" />
            Crowdsourced Status Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingState variant="card" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5" />
            Crowdsourced Status Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Failed to load settings</p>
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
              <MessageSquareWarning className="h-5 w-5" />
              Crowdsourced Status Reports
            </CardTitle>
            <CardDescription className="mt-1">
              Allow visitors to report when they think a service is down. This helps detect issues faster.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {updateSettings.isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <Switch
              checked={enabled}
              onCheckedChange={handleEnabledChange}
              disabled={updateSettings.isPending}
            />
          </div>
        </div>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Report Threshold */}
            <div className="space-y-2">
              <Label htmlFor="reportThreshold" className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Report Threshold
              </Label>
              <Input
                id="reportThreshold"
                type="number"
                min={5}
                max={1000}
                value={reportThreshold}
                onChange={(e) => setReportThreshold(parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-muted-foreground">
                Number of reports needed to trigger auto-degradation ({reportThreshold} reports)
              </p>
            </div>

            {/* Time Window */}
            <div className="space-y-2">
              <Label htmlFor="timeWindow" className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Time Window (minutes)
              </Label>
              <Input
                id="timeWindow"
                type="number"
                min={5}
                max={60}
                value={timeWindowMinutes}
                onChange={(e) => setTimeWindowMinutes(parseInt(e.target.value) || 15)}
              />
              <p className="text-xs text-muted-foreground">
                Reports expire after {timeWindowMinutes} minutes
              </p>
            </div>

            {/* Rate Limit */}
            <div className="space-y-2">
              <Label htmlFor="rateLimit" className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Rate Limit per IP
              </Label>
              <Input
                id="rateLimit"
                type="number"
                min={1}
                max={20}
                value={rateLimitPerIp}
                onChange={(e) => setRateLimitPerIp(parseInt(e.target.value) || 5)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum {rateLimitPerIp} reports per IP within the time window
              </p>
            </div>

            {/* Auto-Degrade Toggle */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Auto-Degrade Status
              </Label>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Automatic Status Change</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically set monitor to "degraded" when threshold is reached
                  </p>
                </div>
                <Switch
                  checked={autoDegradeEnabled}
                  onCheckedChange={setAutoDegradeEnabled}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? (
                <span className="text-amber-600">You have unsaved changes</span>
              ) : (
                <span>All changes saved</span>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateSettings.isPending}
            >
              {updateSettings.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>

          {/* Info Box */}
          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="text-sm font-medium mb-2">How it works</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>1. Visitors see an "Is this down for you?" button on each monitor</li>
              <li>2. When they click it, their report is counted (limited by IP)</li>
              <li>3. Reports are displayed as a count below each monitor</li>
              <li>4. When {reportThreshold}+ reports are received within {timeWindowMinutes} minutes, the monitor status changes to "degraded"</li>
              <li>5. Reports automatically expire after {timeWindowMinutes} minutes</li>
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

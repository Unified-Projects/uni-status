"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Button,
  Input,
  Label,
  Switch,
  Slider,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Separator,
  cn,
} from "@uni-status/ui";
import { ChannelTypeIcon, type AlertChannelType } from "./channel-type-icon";
import type { AlertPolicy, AlertChannel, Monitor } from "@/lib/api-client";

const alertPolicyFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean(),
  conditions: z.object({
    consecutiveFailures: z.number().min(1).max(10).optional(),
    failuresInWindow: z
      .object({
        count: z.number().min(1).max(20),
        windowMinutes: z.number().min(1).max(60),
      })
      .optional(),
    degradedDuration: z.number().min(1).max(120).optional(),
    consecutiveSuccesses: z.number().min(1).max(10).optional(),
  }),
  cooldownMinutes: z.number().min(1).max(1440),
  channelIds: z.array(z.string()).min(1, "At least one channel is required"),
  monitorIds: z.array(z.string()).optional(),
});

type AlertPolicyFormData = z.infer<typeof alertPolicyFormSchema>;

interface AlertPolicyFormProps {
  policy?: AlertPolicy & { channelIds?: string[]; monitorIds?: string[] };
  availableChannels: AlertChannel[];
  availableMonitors: Monitor[];
  onSubmit: (data: AlertPolicyFormData) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function AlertPolicyForm({
  policy,
  availableChannels,
  availableMonitors,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: AlertPolicyFormProps) {
  const isEditMode = !!policy;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AlertPolicyFormData>({
    resolver: zodResolver(alertPolicyFormSchema),
    defaultValues: {
      name: policy?.name ?? "",
      description: policy?.description ?? "",
      enabled: policy?.enabled ?? true,
      conditions: {
        consecutiveFailures: policy?.conditions.consecutiveFailures,
        failuresInWindow: policy?.conditions.failuresInWindow,
        degradedDuration: policy?.conditions.degradedDuration,
        consecutiveSuccesses: policy?.conditions.consecutiveSuccesses,
      },
      cooldownMinutes: policy?.cooldownMinutes ?? 15,
      channelIds: policy?.channelIds ?? [],
      monitorIds: policy?.monitorIds ?? [],
    },
  });

  const watchedEnabled = watch("enabled");
  const watchedConditions = watch("conditions");
  const watchedCooldown = watch("cooldownMinutes");
  const watchedChannelIds = watch("channelIds");
  const watchedMonitorIds = watch("monitorIds");

  // Condition toggles
  const hasConsecutiveFailures = watchedConditions.consecutiveFailures !== undefined;
  const hasFailuresInWindow = watchedConditions.failuresInWindow !== undefined;
  const hasDegradedDuration = watchedConditions.degradedDuration !== undefined;
  const hasConsecutiveSuccesses = watchedConditions.consecutiveSuccesses !== undefined;

  const toggleCondition = (
    condition: keyof AlertPolicyFormData["conditions"],
    defaultValue: number | { count: number; windowMinutes: number }
  ) => {
    const current = watchedConditions[condition];
    if (current === undefined) {
      setValue(`conditions.${condition}`, defaultValue as never);
    } else {
      setValue(`conditions.${condition}`, undefined as never);
    }
  };

  const toggleChannel = (channelId: string) => {
    const current = watchedChannelIds;
    if (current.includes(channelId)) {
      setValue(
        "channelIds",
        current.filter((id) => id !== channelId)
      );
    } else {
      setValue("channelIds", [...current, channelId]);
    }
  };

  const toggleMonitor = (monitorId: string) => {
    const current = watchedMonitorIds || [];
    if (current.includes(monitorId)) {
      setValue(
        "monitorIds",
        current.filter((id) => id !== monitorId)
      );
    } else {
      setValue("monitorIds", [...current, monitorId]);
    }
  };

  const toggleAllMonitors = () => {
    const current = watchedMonitorIds || [];
    if (current.length === availableMonitors.length) {
      setValue("monitorIds", []);
    } else {
      setValue("monitorIds", availableMonitors.map((m) => m.id));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Settings */}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Critical Alert Policy"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-6">
            <div className="space-y-0.5">
              <Label>Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Activate this policy
              </p>
            </div>
            <Switch
              checked={watchedEnabled}
              onCheckedChange={(checked) => setValue("enabled", checked)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            placeholder="Alert when monitors experience issues"
            {...register("description")}
          />
        </div>
      </div>

      {/* Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alert Conditions</CardTitle>
          <CardDescription>
            Define when this policy should trigger an alert
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Consecutive Failures */}
          <div className="flex items-start gap-3">
            <Checkbox
              checked={hasConsecutiveFailures}
              onCheckedChange={() => toggleCondition("consecutiveFailures", 3)}
            />
            <div className="flex-1 space-y-2">
              <Label className={!hasConsecutiveFailures ? "text-muted-foreground" : ""}>
                Consecutive Failures
              </Label>
              {hasConsecutiveFailures && (
                <div className="flex items-center gap-4">
                  <Slider
                    value={[watchedConditions.consecutiveFailures || 3]}
                    onValueChange={([value]) =>
                      setValue("conditions.consecutiveFailures", value)
                    }
                    min={1}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-16 text-sm">
                    {watchedConditions.consecutiveFailures} checks
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Alert after N consecutive failed checks
              </p>
            </div>
          </div>

          <Separator />

          {/* Failures in Window */}
          <div className="flex items-start gap-3">
            <Checkbox
              checked={hasFailuresInWindow}
              onCheckedChange={() =>
                toggleCondition("failuresInWindow", { count: 5, windowMinutes: 10 })
              }
            />
            <div className="flex-1 space-y-2">
              <Label className={!hasFailuresInWindow ? "text-muted-foreground" : ""}>
                Failures in Time Window
              </Label>
              {hasFailuresInWindow && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Failure Count</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[watchedConditions.failuresInWindow?.count || 5]}
                        onValueChange={([value]) =>
                          setValue("conditions.failuresInWindow", {
                            ...watchedConditions.failuresInWindow!,
                            count: value,
                          })
                        }
                        min={1}
                        max={20}
                        step={1}
                        className="flex-1"
                      />
                      <span className="w-12 text-sm">
                        {watchedConditions.failuresInWindow?.count}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Window (minutes)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[watchedConditions.failuresInWindow?.windowMinutes || 10]}
                        onValueChange={([value]) =>
                          setValue("conditions.failuresInWindow", {
                            ...watchedConditions.failuresInWindow!,
                            windowMinutes: value,
                          })
                        }
                        min={1}
                        max={60}
                        step={1}
                        className="flex-1"
                      />
                      <span className="w-12 text-sm">
                        {watchedConditions.failuresInWindow?.windowMinutes}min
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Alert when N failures occur within X minutes
              </p>
            </div>
          </div>

          <Separator />

          {/* Degraded Duration */}
          <div className="flex items-start gap-3">
            <Checkbox
              checked={hasDegradedDuration}
              onCheckedChange={() => toggleCondition("degradedDuration", 5)}
            />
            <div className="flex-1 space-y-2">
              <Label className={!hasDegradedDuration ? "text-muted-foreground" : ""}>
                Degraded Duration
              </Label>
              {hasDegradedDuration && (
                <div className="flex items-center gap-4">
                  <Slider
                    value={[watchedConditions.degradedDuration || 5]}
                    onValueChange={([value]) =>
                      setValue("conditions.degradedDuration", value)
                    }
                    min={1}
                    max={120}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-16 text-sm">
                    {watchedConditions.degradedDuration} min
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Alert when monitor is degraded for X minutes
              </p>
            </div>
          </div>

          <Separator />

          {/* Recovery Notification */}
          <div className="flex items-start gap-3">
            <Checkbox
              checked={hasConsecutiveSuccesses}
              onCheckedChange={() => toggleCondition("consecutiveSuccesses", 2)}
            />
            <div className="flex-1 space-y-2">
              <Label className={!hasConsecutiveSuccesses ? "text-muted-foreground" : ""}>
                Recovery Notification
              </Label>
              {hasConsecutiveSuccesses && (
                <div className="flex items-center gap-4">
                  <Slider
                    value={[watchedConditions.consecutiveSuccesses || 2]}
                    onValueChange={([value]) =>
                      setValue("conditions.consecutiveSuccesses", value)
                    }
                    min={1}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-16 text-sm">
                    {watchedConditions.consecutiveSuccesses} checks
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Notify when monitor recovers with N consecutive successful checks
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cooldown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cooldown Period</CardTitle>
          <CardDescription>
            Minimum time between repeated alerts for the same issue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Slider
              value={[watchedCooldown]}
              onValueChange={([value]) => setValue("cooldownMinutes", value)}
              min={1}
              max={1440}
              step={1}
              className="flex-1"
            />
            <span className="w-20 text-sm">
              {watchedCooldown >= 60
                ? `${Math.floor(watchedCooldown / 60)}h ${watchedCooldown % 60}m`
                : `${watchedCooldown} min`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Channels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Channels *</CardTitle>
          <CardDescription>
            Select channels to receive alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {availableChannels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No channels available. Create a channel first.
            </p>
          ) : (
            <div className="space-y-2">
              {availableChannels.map((channel) => (
                <div
                  key={channel.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    watchedChannelIds.includes(channel.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => toggleChannel(channel.id)}
                >
                  <Checkbox
                    checked={watchedChannelIds.includes(channel.id)}
                    onCheckedChange={() => toggleChannel(channel.id)}
                  />
                  <ChannelTypeIcon
                    type={channel.type as AlertChannelType}
                    size="sm"
                    showBackground
                    disabled={!channel.enabled}
                  />
                  <div className="flex-1">
                    <span className="font-medium">{channel.name}</span>
                    {!channel.enabled && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (disabled)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {errors.channelIds && (
            <p className="mt-2 text-sm text-destructive">{errors.channelIds.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Monitors */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Apply to Monitors</CardTitle>
              <CardDescription>
                Select monitors to apply this policy (empty = all monitors)
              </CardDescription>
            </div>
            {availableMonitors.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleAllMonitors}
              >
                {(watchedMonitorIds?.length || 0) === availableMonitors.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {availableMonitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No monitors available.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {availableMonitors.map((monitor) => (
                <div
                  key={monitor.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    watchedMonitorIds?.includes(monitor.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => toggleMonitor(monitor.id)}
                >
                  <Checkbox
                    checked={watchedMonitorIds?.includes(monitor.id)}
                    onCheckedChange={() => toggleMonitor(monitor.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">
                      {monitor.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate block">
                      {monitor.url}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {(watchedMonitorIds?.length || 0) === 0
              ? "Policy will apply to all monitors"
              : `Policy will apply to ${watchedMonitorIds?.length} selected monitor(s)`}
          </p>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEditMode
              ? "Saving..."
              : "Creating..."
            : isEditMode
              ? "Save Changes"
              : "Create Policy"}
        </Button>
      </div>
    </form>
  );
}

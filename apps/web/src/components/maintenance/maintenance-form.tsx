"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  cn,
} from "@uni-status/ui";
import {
  useCreateMaintenanceWindow,
  useUpdateMaintenanceWindow,
} from "@/hooks/use-maintenance-windows";
import { useMonitors } from "@/hooks/use-monitors";
import type { MaintenanceWindow } from "@/lib/api-client";
import { Calendar, Clock, Repeat, Bell, AlertCircle } from "lucide-react";

const maintenanceFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(2000).optional(),
  startsAt: z.string().min(1, "Start time is required"),
  endsAt: z.string().min(1, "End time is required"),
  timezone: z.string().optional().default("Europe/London"),
  affectedMonitors: z.array(z.string()).min(1, "Select at least one monitor"),
  recurrenceType: z.enum(["none", "daily", "weekly", "monthly"]).optional().default("none"),
  recurrenceInterval: z.number().int().positive().optional(),
  notifyOnStart: z.boolean().optional().default(true),
  notifyOnEnd: z.boolean().optional().default(true),
  notifyBeforeStart: z.number().int().nonnegative().optional(),
}).refine(
  (data) => new Date(data.endsAt) > new Date(data.startsAt),
  {
    message: "End time must be after start time",
    path: ["endsAt"],
  }
);

type MaintenanceFormData = z.input<typeof maintenanceFormSchema>;

interface MaintenanceFormProps {
  maintenance?: MaintenanceWindow;
  mode: "create" | "edit";
}

const TIMEZONES = [
  { value: "Europe/London", label: "London (UK)" },
  { value: "Europe/Dublin", label: "Dublin (Ireland)" },
  { value: "Europe/Paris", label: "Paris (EU)" },
  { value: "Europe/Berlin", label: "Berlin (EU)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (EU)" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York (US)" },
  { value: "America/Chicago", label: "Chicago (US)" },
  { value: "America/Denver", label: "Denver (US)" },
  { value: "America/Los_Angeles", label: "Los Angeles (US)" },
  { value: "Asia/Tokyo", label: "Tokyo (JP)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney (AU)" },
];

const RECURRENCE_TYPES = [
  { value: "none", label: "No recurrence" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const NOTIFY_BEFORE_OPTIONS = [
  { value: 0, label: "No notification" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
];

// Format date for datetime-local input
function formatDateForInput(dateString: string): string {
  const date = new Date(dateString);
  return date.toISOString().slice(0, 16);
}

// Get default start time (next hour)
function getDefaultStartTime(): string {
  const now = new Date();
  now.setHours(now.getHours() + 1, 0, 0, 0);
  return now.toISOString().slice(0, 16);
}

// Get default end time (2 hours after start)
function getDefaultEndTime(): string {
  const now = new Date();
  now.setHours(now.getHours() + 3, 0, 0, 0);
  return now.toISOString().slice(0, 16);
}

export function MaintenanceForm({ maintenance, mode }: MaintenanceFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { data: monitorsResponse, isLoading: monitorsLoading } = useMonitors();
  const monitors = monitorsResponse?.data;
  const createMaintenanceWindow = useCreateMaintenanceWindow();
  const updateMaintenanceWindow = useUpdateMaintenanceWindow();

  const isSubmitting = createMaintenanceWindow.isPending || updateMaintenanceWindow.isPending;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceFormSchema) as any,
    defaultValues: {
      name: maintenance?.name ?? "",
      description: maintenance?.description ?? "",
      startsAt: maintenance?.startsAt ? formatDateForInput(maintenance.startsAt) : getDefaultStartTime(),
      endsAt: maintenance?.endsAt ? formatDateForInput(maintenance.endsAt) : getDefaultEndTime(),
      timezone: maintenance?.timezone ?? "Europe/London",
      affectedMonitors: maintenance?.affectedMonitors ?? [],
      recurrenceType: (maintenance?.recurrence?.type as MaintenanceFormData["recurrenceType"]) ?? "none",
      recurrenceInterval: maintenance?.recurrence?.interval ?? 1,
      notifyOnStart: maintenance?.notifySubscribers?.onStart ?? true,
      notifyOnEnd: maintenance?.notifySubscribers?.onEnd ?? true,
      notifyBeforeStart: maintenance?.notifySubscribers?.beforeStart ?? 0,
    },
  });

  const selectedMonitors = watch("affectedMonitors") ?? [];
  const recurrenceType = watch("recurrenceType");

  const toggleMonitor = (monitorId: string) => {
    const current = selectedMonitors;
    const updated = current.includes(monitorId)
      ? current.filter((id) => id !== monitorId)
      : [...current, monitorId];
    setValue("affectedMonitors", updated);
  };

  const selectAllMonitors = () => {
    if (monitors) {
      setValue("affectedMonitors", monitors.map((m) => m.id));
    }
  };

  const clearAllMonitors = () => {
    setValue("affectedMonitors", []);
  };

  const onSubmit = async (data: MaintenanceFormData) => {
    setSubmitError(null);

    const recurrenceType = data.recurrenceType ?? "none";
    const payload = {
      name: data.name,
      description: data.description || undefined,
      startsAt: new Date(data.startsAt).toISOString(),
      endsAt: new Date(data.endsAt).toISOString(),
      timezone: data.timezone ?? "Europe/London",
      affectedMonitors: data.affectedMonitors,
      recurrence: recurrenceType !== "none"
        ? {
            type: recurrenceType,
            interval: data.recurrenceInterval ?? 1,
          }
        : { type: "none" as const },
      notifySubscribers: {
        onStart: data.notifyOnStart ?? true,
        onEnd: data.notifyOnEnd ?? true,
        beforeStart: data.notifyBeforeStart || undefined,
      },
    };

    try {
      if (mode === "create") {
        const newWindow = await createMaintenanceWindow.mutateAsync(payload);
        router.push(`/maintenance-windows/${newWindow.id}`);
      } else if (maintenance) {
        await updateMaintenanceWindow.mutateAsync({ id: maintenance.id, data: payload });
        router.push(`/maintenance-windows/${maintenance.id}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save maintenance window";
      setSubmitError(message);
      console.error("Maintenance form submission error:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Error Display */}
      {submitError && (
        <div className="flex items-center gap-2 p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Maintenance Details
          </CardTitle>
          <CardDescription>
            Provide information about the scheduled maintenance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Database Server Upgrade"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              placeholder="Describe the maintenance work being performed..."
              {...register("description")}
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule
          </CardTitle>
          <CardDescription>
            Set the maintenance window time period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startsAt">Start Time *</Label>
              <Input
                id="startsAt"
                type="datetime-local"
                {...register("startsAt")}
              />
              {errors.startsAt && (
                <p className="text-sm text-destructive">{errors.startsAt.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endsAt">End Time *</Label>
              <Input
                id="endsAt"
                type="datetime-local"
                {...register("endsAt")}
              />
              {errors.endsAt && (
                <p className="text-sm text-destructive">{errors.endsAt.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select
              value={watch("timezone")}
              onValueChange={(v) => setValue("timezone", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Recurrence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Recurrence
          </CardTitle>
          <CardDescription>
            Optionally make this a recurring maintenance window
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Repeat</Label>
              <Select
                value={recurrenceType}
                onValueChange={(v) => setValue("recurrenceType", v as MaintenanceFormData["recurrenceType"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {recurrenceType !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="recurrenceInterval">Every</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="recurrenceInterval"
                    type="number"
                    min={1}
                    max={30}
                    className="w-20"
                    {...register("recurrenceInterval", { valueAsNumber: true })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {recurrenceType === "daily" ? "day(s)" : recurrenceType === "weekly" ? "week(s)" : "month(s)"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Affected Monitors */}
      <Card>
        <CardHeader>
          <CardTitle>Affected Monitors *</CardTitle>
          <CardDescription>
            Select the monitors that will be affected during this maintenance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-end gap-2 mb-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAllMonitors}
              disabled={!monitors?.length}
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearAllMonitors}
              disabled={!selectedMonitors.length}
            >
              Clear All
            </Button>
          </div>

          {monitorsLoading ? (
            <div className="text-sm text-muted-foreground">Loading monitors...</div>
          ) : monitors && monitors.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {monitors.map((monitor) => (
                <label
                  key={monitor.id}
                  className={cn(
                    "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                    selectedMonitors.includes(monitor.id)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={selectedMonitors.includes(monitor.id)}
                    onCheckedChange={() => toggleMonitor(monitor.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{monitor.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {monitor.url}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded",
                      monitor.status === "active"
                        ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)]"
                        : monitor.status === "degraded"
                          ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"
                          : monitor.status === "down"
                            ? "bg-[var(--status-error-bg)] text-[var(--status-error-text)]"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    )}
                  >
                    {monitor.status}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No monitors available. Create monitors first to schedule maintenance.
            </div>
          )}
          {errors.affectedMonitors && (
            <p className="mt-2 text-sm text-destructive">{errors.affectedMonitors.message}</p>
          )}
          {selectedMonitors.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {selectedMonitors.length} monitor{selectedMonitors.length !== 1 ? "s" : ""} selected
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Configure how subscribers are notified about this maintenance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <Checkbox
                checked={watch("notifyOnStart")}
                onCheckedChange={(checked) => setValue("notifyOnStart", !!checked)}
              />
              <div>
                <div className="font-medium">Notify when maintenance starts</div>
                <div className="text-sm text-muted-foreground">
                  Send a notification when the maintenance window begins
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3">
              <Checkbox
                checked={watch("notifyOnEnd")}
                onCheckedChange={(checked) => setValue("notifyOnEnd", !!checked)}
              />
              <div>
                <div className="font-medium">Notify when maintenance ends</div>
                <div className="text-sm text-muted-foreground">
                  Send a notification when the maintenance window completes
                </div>
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <Label>Advance notification</Label>
            <Select
              value={String(watch("notifyBeforeStart") ?? 0)}
              onValueChange={(v) => setValue("notifyBeforeStart", parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTIFY_BEFORE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Send a heads-up notification before maintenance begins
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Schedule Maintenance"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

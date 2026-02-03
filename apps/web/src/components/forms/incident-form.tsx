"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Button,
  LoadingButton,
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
  toast,
} from "@uni-status/ui";
import { useCreateIncident, useUpdateIncident, useAddIncidentUpdate } from "@/hooks/use-incidents";
import { useMonitors } from "@/hooks/use-monitors";
import type { Incident } from "@/lib/api-client";
import { AlertTriangle, AlertCircle, AlertOctagon, Search, Eye, CheckCircle } from "lucide-react";

const incidentFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  severity: z.enum(["minor", "major", "critical"]),
  message: z.string().max(5000).optional(),
  affectedMonitors: z.array(z.string()).optional(),
});

type IncidentFormData = z.infer<typeof incidentFormSchema>;

const incidentUpdateFormSchema = z.object({
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  message: z.string().min(1, "Update message is required").max(5000),
});

type IncidentUpdateFormData = z.infer<typeof incidentUpdateFormSchema>;

interface IncidentFormProps {
  incident?: Incident;
  mode: "create" | "edit";
}

const SEVERITIES = [
  { value: "minor", label: "Minor", icon: AlertTriangle, color: "text-yellow-500" },
  { value: "major", label: "Major", icon: AlertCircle, color: "text-orange-500" },
  { value: "critical", label: "Critical", icon: AlertOctagon, color: "text-red-500" },
] as const;

const STATUSES = [
  { value: "investigating", label: "Investigating", icon: Search, color: "text-yellow-600" },
  { value: "identified", label: "Identified", icon: AlertCircle, color: "text-orange-600" },
  { value: "monitoring", label: "Monitoring", icon: Eye, color: "text-blue-600" },
  { value: "resolved", label: "Resolved", icon: CheckCircle, color: "text-green-600" },
] as const;

export function IncidentForm({ incident, mode }: IncidentFormProps) {
  const router = useRouter();
  const { data: monitorsResponse, isLoading: monitorsLoading } = useMonitors();
  const monitors = monitorsResponse?.data;
  const createIncident = useCreateIncident();
  const updateIncident = useUpdateIncident();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<IncidentFormData>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: {
      title: incident?.title ?? "",
      status: (incident?.status as IncidentFormData["status"]) ?? "investigating",
      severity: (incident?.severity as IncidentFormData["severity"]) ?? "minor",
      message: incident?.message ?? "",
      affectedMonitors: [],
    },
  });

  const selectedMonitors = watch("affectedMonitors") ?? [];

  const toggleMonitor = (monitorId: string) => {
    const current = selectedMonitors;
    const updated = current.includes(monitorId)
      ? current.filter((id) => id !== monitorId)
      : [...current, monitorId];
    setValue("affectedMonitors", updated);
  };

  const onSubmit = async (data: IncidentFormData) => {
    try {
      const payload = {
        title: data.title,
        status: data.status,
        severity: data.severity,
        message: data.message || undefined,
        affectedMonitors: data.affectedMonitors?.length ? data.affectedMonitors : undefined,
      };

      if (mode === "create") {
        const newIncident = await createIncident.mutateAsync(payload);
        toast({
          title: "Incident created",
          description: `${data.title} has been created`,
        });
        router.push(`/incidents/${newIncident.id}`);
      } else if (incident) {
        await updateIncident.mutateAsync({ id: incident.id, data: payload });
        toast({
          title: "Incident updated",
          description: `Changes to ${data.title} have been saved`,
        });
        router.push(`/incidents/${incident.id}`);
      }
    } catch (error) {
      toast({
        title: mode === "create" ? "Failed to create incident" : "Failed to update incident",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Incident Details</CardTitle>
          <CardDescription>
            Provide information about the incident
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Brief description of the incident"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select
                value={watch("severity")}
                onValueChange={(v) => setValue("severity", v as IncidentFormData["severity"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((severity) => {
                    const Icon = severity.icon;
                    return (
                      <SelectItem key={severity.value} value={severity.value}>
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", severity.color)} />
                          {severity.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How severe is this incident?
              </p>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={watch("status")}
                onValueChange={(v) => setValue("status", v as IncidentFormData["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => {
                    const Icon = status.icon;
                    return (
                      <SelectItem key={status.value} value={status.value}>
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", status.color)} />
                          {status.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Current status of the incident
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Initial Message</Label>
            <textarea
              id="message"
              placeholder="Describe what is happening and the impact on users..."
              {...register("message")}
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {errors.message && (
              <p className="text-sm text-destructive">{errors.message.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              This message will be displayed on your status page
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Affected Monitors */}
      <Card>
        <CardHeader>
          <CardTitle>Affected Monitors</CardTitle>
          <CardDescription>
            Select the monitors affected by this incident
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                        ? "bg-green-100 text-green-700"
                        : monitor.status === "degraded"
                          ? "bg-yellow-100 text-yellow-700"
                          : monitor.status === "down"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                    )}
                  >
                    {monitor.status}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No monitors available. Create monitors first to link them to incidents.
            </div>
          )}
          {selectedMonitors.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {selectedMonitors.length} monitor{selectedMonitors.length !== 1 ? "s" : ""} selected
            </p>
          )}
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
        <LoadingButton
          type="submit"
          isLoading={isSubmitting || createIncident.isPending || updateIncident.isPending}
          isSuccess={createIncident.isSuccess || updateIncident.isSuccess}
          isError={createIncident.isError || updateIncident.isError}
          loadingText={mode === "create" ? "Creating..." : "Saving..."}
          successText={mode === "create" ? "Created" : "Saved"}
          errorText="Failed"
        >
          {mode === "create" ? "Create Incident" : "Save Changes"}
        </LoadingButton>
      </div>
    </form>
  );
}

// Separate form for posting incident updates
interface IncidentUpdateFormProps {
  incidentId: string;
  currentStatus: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function IncidentUpdateForm({
  incidentId,
  currentStatus,
  onSuccess,
  onCancel,
}: IncidentUpdateFormProps) {
  const addUpdate = useAddIncidentUpdate();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IncidentUpdateFormData>({
    resolver: zodResolver(incidentUpdateFormSchema),
    defaultValues: {
      status: currentStatus as IncidentUpdateFormData["status"],
      message: "",
    },
  });

  const onSubmit = async (data: IncidentUpdateFormData) => {
    await addUpdate.mutateAsync({
      id: incidentId,
      data: {
        status: data.status,
        message: data.message,
      },
    });
    reset();
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>New Status</Label>
        <Select
          value={watch("status")}
          onValueChange={(v) => setValue("status", v as IncidentUpdateFormData["status"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((status) => {
              const Icon = status.icon;
              return (
                <SelectItem key={status.value} value={status.value}>
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", status.color)} />
                    {status.label}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="update-message">Update Message *</Label>
        <textarea
          id="update-message"
          placeholder="Describe the current status and any progress made..."
          {...register("message")}
          className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {errors.message && (
          <p className="text-sm text-destructive">{errors.message.message}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <LoadingButton
          type="submit"
          isLoading={isSubmitting || addUpdate.isPending}
          isSuccess={addUpdate.isSuccess}
          isError={addUpdate.isError}
          loadingText="Posting..."
          successText="Posted"
          errorText="Failed"
        >
          Post Update
        </LoadingButton>
      </div>
    </form>
  );
}

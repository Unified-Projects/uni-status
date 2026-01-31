"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CalendarClock,
  RefreshCcw,
  Plus,
  Users,
  Clock,
  Trash2,
  Edit2,
  MoreHorizontal,
  Pause,
  Play,
  Bell,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  Checkbox,
} from "@uni-status/ui";
import { apiClient, type OncallRotation } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useOrganizationMembers } from "@/hooks/use-organizations";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { TeamMemberMultiSelect } from "@/components/forms/team-member-multi-select";

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

const SHIFT_DURATIONS = [
  { value: 60, label: "1 hour" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours (1 day)" },
  { value: 10080, label: "1 week" },
];

const rotationFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  timezone: z.string(),
  shiftDurationMinutes: z.number().int().min(60).max(10080),
  participants: z.array(z.string()).min(1, "At least one participant is required"),
  handoffNotificationMinutes: z.number().int().min(5).max(1440),
  handoffChannels: z.array(z.string()),
  active: z.boolean(),
});

type RotationFormData = z.infer<typeof rotationFormSchema>;

function formatShiftDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${minutes / 60} hours`;
  if (minutes === 1440) return "1 day";
  if (minutes === 10080) return "1 week";
  return `${Math.round(minutes / 1440)} days`;
}

export default function OncallPage() {
  const queryClient = useQueryClient();
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingRotation, setEditingRotation] = useState<OncallRotation | null>(null);
  const [deleteRotation, setDeleteRotation] = useState<OncallRotation | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["oncall", "rotations", organizationId],
    queryFn: () => apiClient.oncall.listRotations(organizationId ?? undefined),
    enabled: !!organizationId,
  });

  // Fetch current on-call data
  const { data: currentOncall } = useQuery({
    queryKey: ["oncall", "current", organizationId],
    queryFn: () => apiClient.oncall.getCurrentAll(organizationId ?? undefined),
    enabled: !!organizationId,
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch team members to resolve participant IDs to names
  const { data: membersResponse } = useOrganizationMembers(organizationId || "");
  const members = membersResponse?.data;

  // Create a lookup map from user IDs to names
  const memberNameLookup = useMemo(() => {
    const lookup: Record<string, string> = {};
    if (members) {
      for (const member of members) {
        lookup[member.userId] = member.user?.name || member.user?.email || member.userId;
      }
    }
    return lookup;
  }, [members]);

  // Helper function to get participant names
  const getParticipantNames = (participantIds: string[]): string => {
    if (participantIds.length === 0) return "None configured";
    return participantIds.map((id) => memberNameLookup[id] || id).join(", ");
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<OncallRotation>) =>
      apiClient.oncall.createRotation(data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncall", "rotations"] });
      setCreateDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<OncallRotation> }) =>
      apiClient.oncall.updateRotation(id, data, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncall", "rotations"] });
      setEditingRotation(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.oncall.deleteRotation(id, organizationId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oncall", "rotations"] });
      setDeleteRotation(null);
    },
  });

  const rotations = useMemo(() => data ?? [], [data]);

  if (isLoading) {
    return <LoadingState variant="card" count={3} />;
  }

  if (error) {
    return <ErrorState error={error instanceof Error ? error : new Error("Failed to load on-call")} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">On-Call</h1>
          <p className="text-sm text-muted-foreground">Manage rotations, overrides, and coverage gaps.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create Rotation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <RotationForm
                onSubmit={(data) => createMutation.mutate(data)}
                isLoading={createMutation.isPending}
                onCancel={() => setCreateDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Current On-Call Summary */}
      {currentOncall && currentOncall.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Currently On-Call
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {currentOncall.map((oncall) => (
                <div key={oncall.rotationId} className="flex items-center gap-2">
                  <Badge variant={oncall.isOverride ? "secondary" : "default"}>
                    {oncall.rotationName}
                  </Badge>
                  <span className="font-medium">
                    {memberNameLookup[oncall.currentUserId] || oncall.currentUserId}
                  </span>
                  {oncall.isOverride && (
                    <Badge variant="outline" className="text-xs">Override</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    until {new Date(oncall.shiftEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {rotations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <CalendarClock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No on-call rotations</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
              Create your first on-call rotation to schedule team members for incident response
              and ensure 24/7 coverage.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Rotation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rotations.map((rotation) => (
            <Card key={rotation.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    {rotation.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {rotation.description || "No description"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={rotation.active ? "default" : "secondary"}>
                    {rotation.active ? "Active" : "Paused"}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingRotation(rotation)}>
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          updateMutation.mutate({
                            id: rotation.id,
                            data: { active: !rotation.active },
                          })
                        }
                      >
                        {rotation.active ? (
                          <>
                            <Pause className="mr-2 h-4 w-4" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteRotation(rotation)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {rotation.timezone}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {formatShiftDuration(rotation.shiftDurationMinutes)} shifts
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Users className="h-3 w-3" />
                    {rotation.participants.length} participant{rotation.participants.length !== 1 ? "s" : ""}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Participants: </span>
                    <span className="text-muted-foreground">
                      {getParticipantNames(rotation.participants)}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Overrides: </span>
                    <span className="text-muted-foreground">
                      {rotation.overrides && rotation.overrides.length > 0
                        ? `${rotation.overrides.length} scheduled`
                        : "None"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Handoff: </span>
                    <span className="text-muted-foreground">
                      {rotation.handoffNotificationMinutes} min before via {rotation.handoffChannels?.length || 0} channel(s)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingRotation} onOpenChange={(open) => !open && setEditingRotation(null)}>
        <DialogContent className="sm:max-w-[500px]">
          {editingRotation && (
            <RotationForm
              rotation={editingRotation}
              onSubmit={(data) =>
                updateMutation.mutate({ id: editingRotation.id, data })
              }
              isLoading={updateMutation.isPending}
              onCancel={() => setEditingRotation(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteRotation} onOpenChange={(open) => !open && setDeleteRotation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rotation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteRotation?.name}&quot;? This action cannot
              be undone and will remove all associated overrides.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRotation(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteRotation && deleteMutation.mutate(deleteRotation.id)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RotationFormProps {
  rotation?: OncallRotation;
  onSubmit: (data: Partial<OncallRotation>) => void;
  isLoading: boolean;
  onCancel: () => void;
}

function RotationForm({ rotation, onSubmit, isLoading, onCancel }: RotationFormProps) {
  const organizationId = useDashboardStore((state) => state.currentOrganizationId);

  // Fetch available alert channels for handoff notifications
  const { data: channelsData } = useQuery({
    queryKey: ["alertChannels", organizationId],
    queryFn: () => apiClient.alerts.channels.list(undefined, organizationId ?? undefined),
    enabled: !!organizationId,
  });
  const alertChannels = channelsData?.data ?? [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RotationFormData>({
    resolver: zodResolver(rotationFormSchema),
    defaultValues: {
      name: rotation?.name || "",
      description: rotation?.description || "",
      timezone: rotation?.timezone || "UTC",
      shiftDurationMinutes: rotation?.shiftDurationMinutes || 720,
      participants: rotation?.participants || [],
      handoffNotificationMinutes: rotation?.handoffNotificationMinutes || 30,
      handoffChannels: rotation?.handoffChannels || [],
      active: rotation?.active ?? true,
    },
  });

  const timezone = watch("timezone");
  const shiftDurationMinutes = watch("shiftDurationMinutes");
  const active = watch("active");
  const participants = watch("participants");
  const handoffChannels = watch("handoffChannels");

  const onFormSubmit = (data: RotationFormData) => {
    onSubmit({
      name: data.name,
      description: data.description,
      timezone: data.timezone,
      shiftDurationMinutes: data.shiftDurationMinutes,
      participants: data.participants,
      handoffNotificationMinutes: data.handoffNotificationMinutes,
      handoffChannels: data.handoffChannels,
      active: data.active,
    });
  };

  const toggleChannel = (channelId: string) => {
    const current = handoffChannels || [];
    if (current.includes(channelId)) {
      setValue("handoffChannels", current.filter(id => id !== channelId));
    } else {
      setValue("handoffChannels", [...current, channelId]);
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <DialogHeader>
        <DialogTitle>{rotation ? "Edit Rotation" : "Create Rotation"}</DialogTitle>
        <DialogDescription>
          {rotation
            ? "Update the on-call rotation settings."
            : "Set up a new on-call rotation for your team."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="e.g., Primary On-Call"
            {...register("name")}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Describe the rotation purpose..."
            {...register("description")}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select
              value={timezone}
              onValueChange={(value) => setValue("timezone", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Shift Duration</Label>
            <Select
              value={shiftDurationMinutes.toString()}
              onValueChange={(value) => setValue("shiftDurationMinutes", parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIFT_DURATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value.toString()}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Participants</Label>
          <TeamMemberMultiSelect
            selectedIds={participants}
            onSelectionChange={(ids) => setValue("participants", ids)}
            title="Select On-Call Participants"
            description="Choose team members who will rotate on-call duty"
          />
          {errors.participants && (
            <p className="text-sm text-destructive">{errors.participants.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="handoffNotificationMinutes">Handoff Notification</Label>
          <div className="flex items-center gap-2">
            <Input
              id="handoffNotificationMinutes"
              type="number"
              min={5}
              max={1440}
              className="w-24"
              {...register("handoffNotificationMinutes", { valueAsNumber: true })}
            />
            <span className="text-sm text-muted-foreground">minutes before shift change</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Handoff Notification Channels
          </Label>
          <p className="text-xs text-muted-foreground">
            Select alert channels to notify when shifts change
          </p>
          {alertChannels.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No alert channels configured. Create channels in the Alerts section.
            </p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
              {alertChannels.map((channel) => (
                <div key={channel.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`channel-${channel.id}`}
                    checked={handoffChannels?.includes(channel.id) ?? false}
                    onCheckedChange={() => toggleChannel(channel.id)}
                  />
                  <label
                    htmlFor={`channel-${channel.id}`}
                    className="text-sm flex items-center gap-2 cursor-pointer flex-1"
                  >
                    <Badge variant="outline" className="text-xs">
                      {channel.type}
                    </Badge>
                    {channel.name}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Active</Label>
            <p className="text-xs text-muted-foreground">
              Inactive rotations won&apos;t trigger notifications
            </p>
          </div>
          <Switch
            checked={active}
            onCheckedChange={(checked) => setValue("active", checked)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : rotation ? "Save Changes" : "Create Rotation"}
        </Button>
      </DialogFooter>
    </form>
  );
}

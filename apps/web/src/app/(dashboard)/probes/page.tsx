"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Plus,
  Server,
  Copy,
  RefreshCw,
  MoreVertical,
  Trash2,
  Key,
  Link2,
  Unlink,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Alert,
  AlertDescription,
  AlertTitle,
} from "@uni-status/ui";
import { apiClient, type Probe, type PaginationMeta } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useMonitors } from "@/hooks/use-monitors";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePagination } from "@/hooks/use-pagination";
import { useRegions } from "@/hooks/use-regions";
import { Pagination, DEFAULT_PAGE_SIZE, getPaginationProps } from "@/components/ui/pagination";
// Common region suggestions for probes
const COMMON_REGIONS = [
  { value: "uk", label: "UK" },
  { value: "eu-west", label: "EU West" },
  { value: "eu-central", label: "EU Central" },
  { value: "us-east", label: "US East" },
  { value: "us-west", label: "US West" },
  { value: "ap-southeast", label: "Asia Pacific" },
];

// Format region ID to display label
function formatRegionLabel(regionId: string | null): string {
  if (!regionId) return "Unknown";
  const region = COMMON_REGIONS.find((r) => r.value === regionId);
  if (region) return region.label;
  // Format custom region IDs nicely
  return regionId
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export default function ProbesPage() {
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useDashboardStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [probeToDelete, setProbeToDelete] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<{ token: string; command: string } | null>(null);
  const [probeToAssign, setProbeToAssign] = useState<string | null>(null);

  // Fetch regions and default region
  const { data: regionsData } = useRegions();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    region: regionsData?.default || "uk",
  });

  // Update region when regionsData loads
  useEffect(() => {
    if (regionsData?.default) {
      setFormData((prev) => ({
        ...prev,
        region: regionsData.default,
      }));
    }
  }, [regionsData?.default]);

  const [assignMonitorId, setAssignMonitorId] = useState("");

  // Pagination
  const { page, setPage, paginationParams } = usePagination();

  const { data: monitorsResponse } = useMonitors();
  const monitors = monitorsResponse?.data;

  const {
    data: probesResponse,
    isLoading,
    error,
    refetch,
  } = useQuery<{ data: Probe[]; meta?: PaginationMeta }>({
    queryKey: ["probes", currentOrganizationId, paginationParams],
    queryFn: () => apiClient.probes.list(paginationParams, currentOrganizationId || undefined),
    enabled: !!currentOrganizationId,
  });

  const probes = probesResponse?.data;
  const meta = probesResponse?.meta;

  const createProbe = useMutation({
    mutationFn: (data: typeof formData) =>
      apiClient.probes.create(data, currentOrganizationId || undefined),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["probes"] });
      setCreateDialogOpen(false);
      setFormData({ name: "", description: "", region: "uk" });
      // Show the token
      setNewToken({
        token: data.authToken,
        command: data.installCommand,
      });
      setTokenDialogOpen(true);
    },
  });

  const deleteProbe = useMutation({
    mutationFn: (id: string) => apiClient.probes.delete(id, currentOrganizationId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["probes"] });
      setDeleteDialogOpen(false);
      setProbeToDelete(null);
    },
  });

  const regenerateToken = useMutation({
    mutationFn: (id: string) =>
      apiClient.probes.regenerateToken(id, currentOrganizationId || undefined),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["probes"] });
      setNewToken({
        token: data.authToken,
        command: data.installCommand,
      });
      setTokenDialogOpen(true);
    },
  });

  const assignProbe = useMutation({
    mutationFn: ({ probeId, monitorId }: { probeId: string; monitorId: string }) =>
      apiClient.probes.assign(probeId, { monitorId }, currentOrganizationId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["probes"] });
      setAssignDialogOpen(false);
      setProbeToAssign(null);
      setAssignMonitorId("");
    },
  });

  const unassignProbe = useMutation({
    mutationFn: ({ probeId, monitorId }: { probeId: string; monitorId: string }) =>
      apiClient.probes.unassign(probeId, monitorId, currentOrganizationId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["probes"] });
    },
  });

  const handleDelete = (id: string) => {
    setProbeToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (probeToDelete) {
      deleteProbe.mutate(probeToDelete);
    }
  };

  const handleCreate = () => {
    createProbe.mutate(formData);
  };

  const handleAssign = () => {
    if (probeToAssign && assignMonitorId) {
      assignProbe.mutate({ probeId: probeToAssign, monitorId: assignMonitorId });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="mr-1 h-3 w-3" /> Active
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" /> Pending
          </Badge>
        );
      case "inactive":
        return (
          <Badge variant="outline">
            <AlertTriangle className="mr-1 h-3 w-3" /> Inactive
          </Badge>
        );
      case "disabled":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" /> Disabled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader onCreateClick={() => setCreateDialogOpen(true)} />
        <LoadingState variant="card" count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader onCreateClick={() => setCreateDialogOpen(true)} />
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader onCreateClick={() => setCreateDialogOpen(true)} />

      {/* Info Alert */}
      <Alert>
        <Server className="h-4 w-4" />
        <AlertTitle>Private Monitoring Agents</AlertTitle>
        <AlertDescription>
          Probes are private monitoring agents that can run on your own infrastructure to check
          internal services. Install a probe agent and assign it to monitors for private
          monitoring.
        </AlertDescription>
      </Alert>

      {probes?.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No probes configured"
          description="Deploy a probe agent on your infrastructure to monitor internal services."
          action={{
            label: "Create Probe",
            onClick: () => setCreateDialogOpen(true),
            icon: Plus,
          }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {probes?.map((probe) => (
              <Card key={probe.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-lg">{probe.name}</CardTitle>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setProbeToAssign(probe.id);
                            setAssignDialogOpen(true);
                          }}
                        >
                          <Link2 className="mr-2 h-4 w-4" />
                          Assign Monitor
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => regenerateToken.mutate(probe.id)}>
                          <Key className="mr-2 h-4 w-4" />
                          Regenerate Token
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(probe.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription>{probe.description || "No description"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      {getStatusBadge(probe.status)}
                      <Badge variant="outline">
                        {formatRegionLabel(probe.region)}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {probe.lastHeartbeatAt && (
                        <p>
                          Last heartbeat:{" "}
                          {formatDistanceToNow(new Date(probe.lastHeartbeatAt), { addSuffix: true })}
                        </p>
                      )}
                      {probe.version && <p>Version: {probe.version}</p>}
                      <p>Token: {probe.authTokenPrefix}</p>
                      <p>
                        Assigned monitors: {probe.assignedMonitorCount || probe.assignments?.length || 0}
                      </p>
                    </div>
                    {probe.assignments && probe.assignments.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Assigned Monitors:</p>
                        <div className="flex flex-wrap gap-1">
                          {probe.assignments.slice(0, 3).map((assignment) => (
                            <Badge
                              key={assignment.id}
                              variant="secondary"
                              className="text-xs cursor-pointer"
                              onClick={() =>
                                unassignProbe.mutate({
                                  probeId: probe.id,
                                  monitorId: assignment.monitorId,
                                })
                              }
                            >
                              {assignment.monitor.name}
                              <Unlink className="ml-1 h-2 w-2" />
                            </Badge>
                          ))}
                          {probe.assignments.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{probe.assignments.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {meta && probes && (
            <Pagination
              {...getPaginationProps(meta, probes.length, setPage, "probes")}
            />
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Probe</DialogTitle>
            <DialogDescription>
              Register a new probe agent for private monitoring.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Production Server Probe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe where this probe is running..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                placeholder="e.g. uk, eu-west, us-east"
                list="region-suggestions"
              />
              <datalist id="region-suggestions">
                {COMMON_REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>
                    {region.label}
                  </option>
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Enter a region identifier. This determines which monitors can use this probe.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createProbe.isPending || !formData.name}>
              {createProbe.isPending ? "Creating..." : "Create Probe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token Display Dialog */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Probe Created Successfully</DialogTitle>
            <DialogDescription>
              Save this token now. It will only be shown once!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Copy this token and install command now. The token cannot be retrieved later.
              </AlertDescription>
            </Alert>
            {newToken && (
              <>
                <div className="space-y-2">
                  <Label>Auth Token</Label>
                  <div className="flex gap-2">
                    <Input value={newToken.token} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(newToken.token)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Install Command</Label>
                  <div className="flex gap-2">
                    <Input value={newToken.command} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(newToken.command)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setTokenDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Monitor</DialogTitle>
            <DialogDescription>
              Select a monitor to assign to this probe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="monitor">Monitor</Label>
              <Select value={assignMonitorId} onValueChange={setAssignMonitorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a monitor" />
                </SelectTrigger>
                <SelectContent>
                  {monitors?.map((monitor) => (
                    <SelectItem key={monitor.id} value={monitor.id}>
                      {monitor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={assignProbe.isPending || !assignMonitorId}>
              {assignProbe.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Probe</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this probe? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteProbe.isPending}>
              {deleteProbe.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageHeader({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">Probes</h1>
        <p className="text-muted-foreground">Manage private monitoring agents</p>
      </div>
      <Button onClick={onCreateClick}>
        <Plus className="mr-2 h-4 w-4" />
        Create Probe
      </Button>
    </div>
  );
}

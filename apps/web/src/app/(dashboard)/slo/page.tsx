"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MoreVertical,
  Trash2,
  Edit,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@uni-status/ui";
import { apiClient, type SloDashboardSummary, type SloTarget } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useMonitors } from "@/hooks/use-monitors";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";

type SloWindow = "daily" | "weekly" | "monthly" | "quarterly" | "annually";

export default function SloPage() {
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useDashboardStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sloToDelete, setSloToDelete] = useState<string | null>(null);
  const [sloToEdit, setSloToEdit] = useState<{ id: string; name: string; monitorId: string; targetPercentage: number; window: SloWindow } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    monitorId: "",
    targetPercentage: 99.9,
    window: "monthly" as SloWindow,
  });

  const { data: monitorsResponse } = useMonitors();
  const monitors = monitorsResponse?.data;

  const {
    data: dashboard,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["slo", "dashboard", currentOrganizationId],
    queryFn: () => apiClient.slo.dashboard(currentOrganizationId || undefined),
    enabled: !!currentOrganizationId,
  });

  const createSlo = useMutation({
    mutationFn: (data: typeof formData) =>
      apiClient.slo.create(data, currentOrganizationId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slo"] });
      setCreateDialogOpen(false);
      setFormData({ name: "", monitorId: "", targetPercentage: 99.9, window: "monthly" });
    },
  });

  const deleteSlo = useMutation({
    mutationFn: (id: string) => apiClient.slo.delete(id, currentOrganizationId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slo"] });
      setDeleteDialogOpen(false);
      setSloToDelete(null);
    },
  });

  const updateSlo = useMutation({
    mutationFn: (data: { id: string; name: string; monitorId: string; targetPercentage: number; window: SloWindow }) =>
      apiClient.slo.update(data.id, { name: data.name, monitorId: data.monitorId, targetPercentage: data.targetPercentage, window: data.window }, currentOrganizationId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slo"] });
      setEditDialogOpen(false);
      setSloToEdit(null);
    },
  });

  const handleDelete = (id: string) => {
    setSloToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleEdit = (slo: { id: string; name: string; targetPercentage: number; window: string; monitor: { id: string } }) => {
    setSloToEdit({
      id: slo.id,
      name: slo.name,
      monitorId: slo.monitor.id,
      targetPercentage: slo.targetPercentage,
      window: slo.window as SloWindow,
    });
    setEditDialogOpen(true);
  };

  const confirmUpdate = () => {
    if (sloToEdit) {
      updateSlo.mutate(sloToEdit);
    }
  };

  const confirmDelete = () => {
    if (sloToDelete) {
      deleteSlo.mutate(sloToDelete);
    }
  };

  const handleCreate = () => {
    createSlo.mutate(formData);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-500";
      case "at_risk":
        return "bg-yellow-500";
      case "breached":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "at_risk":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "breached":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader onCreateClick={() => setCreateDialogOpen(true)} />
        <LoadingState variant="card" count={4} />
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

      {/* Summary Stats */}
      {dashboard && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total SLOs</CardDescription>
              <CardTitle className="text-3xl">{dashboard.stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Healthy</CardDescription>
              <CardTitle className="text-3xl text-green-600">{dashboard.stats.healthy}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>At Risk</CardDescription>
              <CardTitle className="text-3xl text-yellow-600">{dashboard.stats.atRisk}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Breached</CardDescription>
              <CardTitle className="text-3xl text-red-600">{dashboard.stats.breached}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* SLO List */}
      {dashboard?.slos.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No SLO targets yet"
          description="Create your first SLO target to track service level objectives."
          action={{
            label: "Create SLO",
            onClick: () => setCreateDialogOpen(true),
            icon: Plus,
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboard?.slos.map((slo) => (
            <Card key={slo.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(slo.status)}
                    <CardTitle className="text-lg">{slo.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(slo)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(slo.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardDescription>
                  {slo.monitor.name} - {slo.targetPercentage}% target
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Error Budget Remaining</span>
                      <span className="font-medium">{slo.percentRemaining.toFixed(1)}%</span>
                    </div>
                    <Progress
                      value={slo.percentRemaining}
                      className={cn(
                        "h-2",
                        slo.status === "breached" && "[&>div]:bg-red-500",
                        slo.status === "at_risk" && "[&>div]:bg-yellow-500",
                        slo.status === "healthy" && "[&>div]:bg-green-500"
                      )}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span className="capitalize">{slo.window}</span>
                    <span className="flex items-center gap-1">
                      {slo.breachCount > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="destructive" className="cursor-help">
                                {slo.breachCount} breach{slo.breachCount !== 1 ? "es" : ""}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-medium mb-1">What is a breach?</p>
                              <p className="text-xs">
                                A breach occurs when actual downtime exceeds the allowed error budget.
                                For example, a 99.9% SLO allows ~43 minutes of downtime per month.
                                If downtime exceeds this, the SLO is breached.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create SLO Target</DialogTitle>
            <DialogDescription>
              Define a new service level objective for a monitor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., API Availability SLO"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monitor">Monitor</Label>
              <Select
                value={formData.monitorId}
                onValueChange={(value) => setFormData({ ...formData, monitorId: value })}
              >
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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="target">Target Percentage</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        SLO targets must be between 90-100%. A 99.9% target allows ~43 minutes
                        of downtime per month, while 99% allows ~7 hours. Lower values would
                        allow excessive downtime making the SLO meaningless.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="target"
                type="number"
                min="90"
                max="100"
                step="0.01"
                value={formData.targetPercentage}
                onChange={(e) =>
                  setFormData({ ...formData, targetPercentage: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Range: 90% - 100%. Common targets: 99.9% (three nines), 99.99% (four nines)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="window">Window</Label>
              <Select
                value={formData.window}
                onValueChange={(value: SloWindow) =>
                  setFormData({ ...formData, window: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createSlo.isPending || !formData.name || !formData.monitorId}
            >
              {createSlo.isPending ? "Creating..." : "Create SLO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete SLO Target</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this SLO target? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteSlo.isPending}
            >
              {deleteSlo.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit SLO Target</DialogTitle>
            <DialogDescription>
              Update the service level objective settings.
            </DialogDescription>
          </DialogHeader>
          {sloToEdit && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={sloToEdit.name}
                  onChange={(e) => setSloToEdit({ ...sloToEdit, name: e.target.value })}
                  placeholder="e.g., API Availability SLO"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-monitor">Monitor</Label>
                <Select
                  value={sloToEdit.monitorId}
                  onValueChange={(value) => setSloToEdit({ ...sloToEdit, monitorId: value })}
                >
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="edit-target">Target Percentage</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          SLO targets must be between 90-100%. A 99.9% target allows ~43 minutes
                          of downtime per month, while 99% allows ~7 hours.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="edit-target"
                  type="number"
                  min="90"
                  max="100"
                  step="0.01"
                  value={sloToEdit.targetPercentage}
                  onChange={(e) =>
                    setSloToEdit({ ...sloToEdit, targetPercentage: parseFloat(e.target.value) })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Range: 90% - 100%
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-window">Window</Label>
                <Select
                  value={sloToEdit.window}
                  onValueChange={(value: SloWindow) =>
                    setSloToEdit({ ...sloToEdit, window: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmUpdate}
              disabled={updateSlo.isPending || !sloToEdit?.name || !sloToEdit?.monitorId}
            >
              {updateSlo.isPending ? "Saving..." : "Save Changes"}
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
        <h1 className="text-3xl font-bold">SLO Targets</h1>
        <p className="text-muted-foreground">
          Track service level objectives and error budgets
        </p>
      </div>
      <Button onClick={onCreateClick}>
        <Plus className="mr-2 h-4 w-4" />
        Create SLO
      </Button>
    </div>
  );
}

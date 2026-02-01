"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Bell,
  Plus,
  Search,
  Filter,
  X,
} from "lucide-react";
import {
  Button,
  Input,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  cn,
} from "@uni-status/ui";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination, DEFAULT_PAGE_SIZE, getPaginationProps } from "@/components/ui/pagination";
import {
  useAlertChannels,
  useAlertPolicies,
  useAlertHistory,
  useCreateAlertChannel,
  useUpdateAlertChannel,
  useDeleteAlertChannel,
  useTestAlertChannel,
  useCreateAlertPolicy,
  useUpdateAlertPolicy,
  useDeleteAlertPolicy,
  useAcknowledgeAlert,
  usePolicyMonitorCounts,
  useOncallRotations,
} from "@/hooks/use-alerts";
import { useMonitors } from "@/hooks/use-monitors";
import {
  AlertChannelCard,
  AlertPolicyCard,
  AlertStatusBadge,
  ChannelDialog,
  PolicyDialog,
  ChannelTypeSelector,
  type AlertHistoryStatus,
} from "@/components/alerts";
import type { AlertChannelType } from "@/components/alerts/channel-type-icon";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import type { AlertChannel, AlertPolicy, AlertHistoryRecord } from "@/lib/api-client";

const HISTORY_STATUS_OPTIONS: { value: AlertHistoryStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "triggered", label: "Triggered" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
];

export default function AlertsPage() {
  // Dialog states
  const [typeSelectorOpen, setTypeSelectorOpen] = useState(false);
  const [selectedChannelType, setSelectedChannelType] = useState<AlertChannelType | null>(null);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [deleteChannelDialogOpen, setDeleteChannelDialogOpen] = useState(false);
  const [deletePolicyDialogOpen, setDeletePolicyDialogOpen] = useState(false);

  // Selected items for editing/deleting
  const [selectedChannel, setSelectedChannel] = useState<AlertChannel | undefined>();
  const [selectedPolicy, setSelectedPolicy] = useState<AlertPolicy | undefined>();
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null);
  const [policyToDelete, setPolicyToDelete] = useState<string | null>(null);

  // History filters
  const [historyStatusFilter, setHistoryStatusFilter] = useState<AlertHistoryStatus | "all">("all");

  // Pagination for each tab
  const channelsPagination = usePagination();
  const policiesPagination = usePagination();
  const historyPagination = usePagination();

  // Reset history pagination when filter changes
  useEffect(() => {
    historyPagination.resetPage();
  }, [historyStatusFilter]);

  // Data fetching
  const { data: channelsResponse, isLoading: channelsLoading, error: channelsError, refetch: refetchChannels } = useAlertChannels(channelsPagination.paginationParams);
  const { data: policiesResponse, isLoading: policiesLoading, error: policiesError, refetch: refetchPolicies } = useAlertPolicies(policiesPagination.paginationParams);
  const { data: historyResponse, isLoading: historyLoading, error: historyError, refetch: refetchHistory } = useAlertHistory({
    ...historyPagination.paginationParams,
    status: historyStatusFilter !== "all" ? historyStatusFilter : undefined,
  });

  const channels = channelsResponse?.data;
  const channelsMeta = channelsResponse?.meta;
  const policies = policiesResponse?.data;
  const policiesMeta = policiesResponse?.meta;
  const history = historyResponse?.data;
  const historyMeta = historyResponse?.meta;

  const { data: monitorsResponse } = useMonitors();
  const monitors = monitorsResponse?.data;
  const { data: policyMonitorCounts } = usePolicyMonitorCounts();
  const { data: oncallRotations } = useOncallRotations();

  // Mutations
  const createChannel = useCreateAlertChannel();
  const updateChannel = useUpdateAlertChannel();
  const deleteChannel = useDeleteAlertChannel();
  const testChannel = useTestAlertChannel();
  const createPolicy = useCreateAlertPolicy();
  const updatePolicy = useUpdateAlertPolicy();
  const deletePolicy = useDeleteAlertPolicy();
  const acknowledgeAlert = useAcknowledgeAlert();

  // Track test pending state per channel
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);

  // Handlers
  const handleCreateChannel = () => {
    setSelectedChannel(undefined);
    setSelectedChannelType(null);
    setTypeSelectorOpen(true);  // Open type selector first
  };

  const handleSelectChannelType = (type: AlertChannelType) => {
    setSelectedChannelType(type);
    setTypeSelectorOpen(false);
    setChannelDialogOpen(true);  // Then open config dialog
  };

  const handleEditChannel = (channel: AlertChannel) => {
    setSelectedChannel(channel);
    setSelectedChannelType(channel.type as AlertChannelType);
    setChannelDialogOpen(true);  // Skip type selector for edit
  };

  const handleDeleteChannelClick = (id: string) => {
    setChannelToDelete(id);
    setDeleteChannelDialogOpen(true);
  };

  const confirmDeleteChannel = async () => {
    if (!channelToDelete) return;
    await deleteChannel.mutateAsync(channelToDelete);
    setDeleteChannelDialogOpen(false);
    setChannelToDelete(null);
  };

  const handleTestChannel = async (id: string) => {
    setTestingChannelId(id);
    try {
      await testChannel.mutateAsync(id);
    } finally {
      setTestingChannelId(null);
    }
  };

  const handleToggleChannelEnabled = async (channel: AlertChannel) => {
    await updateChannel.mutateAsync({
      id: channel.id,
      data: { enabled: !channel.enabled },
    });
  };

  const handleChannelSubmit = async (data: { name: string; type: AlertChannelType; config: Record<string, unknown>; enabled: boolean }) => {
    if (selectedChannel) {
      await updateChannel.mutateAsync({ id: selectedChannel.id, data });
    } else {
      await createChannel.mutateAsync(data as Parameters<typeof createChannel.mutateAsync>[0]);
    }
    setChannelDialogOpen(false);
    setSelectedChannel(undefined);
    setSelectedChannelType(null);
  };

  const handleCreatePolicy = () => {
    setSelectedPolicy(undefined);
    setPolicyDialogOpen(true);
  };

  const handleEditPolicy = (policy: AlertPolicy) => {
    // Transform channels to channelIds for the form
    const policyWithIds = {
      ...policy,
      channelIds: policy.channels ?? [],
      monitorIds: policy.monitorIds ?? [],
    };
    setSelectedPolicy(policyWithIds);
    setPolicyDialogOpen(true);
  };

  const handleDeletePolicyClick = (id: string) => {
    setPolicyToDelete(id);
    setDeletePolicyDialogOpen(true);
  };

  const confirmDeletePolicy = async () => {
    if (!policyToDelete) return;
    await deletePolicy.mutateAsync(policyToDelete);
    setDeletePolicyDialogOpen(false);
    setPolicyToDelete(null);
  };

  const handleTogglePolicyEnabled = async (policy: AlertPolicy) => {
    await updatePolicy.mutateAsync({
      id: policy.id,
      data: { enabled: !policy.enabled },
    });
  };

  const handlePolicySubmit = async (data: { name: string; description?: string; enabled: boolean; conditions: { consecutiveFailures?: number; failuresInWindow?: { count: number; windowMinutes: number }; degradedDuration?: number; consecutiveSuccesses?: number }; cooldownMinutes: number; channelIds: string[]; monitorIds?: string[]; oncallRotationId?: string }) => {
    // Transform form data to API format (channelIds -> channels)
    const apiData = {
      name: data.name,
      description: data.description,
      enabled: data.enabled,
      conditions: data.conditions,
      cooldownMinutes: data.cooldownMinutes,
      channels: data.channelIds,
      monitorIds: data.monitorIds ?? [],
      oncallRotationId: data.oncallRotationId,
    };

    if (selectedPolicy) {
      await updatePolicy.mutateAsync({ id: selectedPolicy.id, data: apiData });
    } else {
      await createPolicy.mutateAsync(apiData as unknown as Parameters<typeof createPolicy.mutateAsync>[0]);
    }
    setPolicyDialogOpen(false);
    setSelectedPolicy(undefined);
  };

  const handleAcknowledge = async (id: string) => {
    await acknowledgeAlert.mutateAsync(id);
  };

  // History table columns
  const historyColumns: Column<AlertHistoryRecord>[] = [
    {
      key: "status",
      header: "Status",
      render: (record) => <AlertStatusBadge status={record.status} />,
    },
    {
      key: "alertPolicyId",
      header: "Policy",
      render: (record) => {
        const policy = policies?.find((p) => p.id === record.alertPolicyId);
        return <span className="font-medium">{policy?.name || "Unknown"}</span>;
      },
    },
    {
      key: "monitorId",
      header: "Monitor",
      render: (record) => {
        const monitor = monitors?.find((m) => m.id === record.monitorId);
        return <span>{monitor?.name || "Unknown"}</span>;
      },
    },
    {
      key: "triggeredAt",
      header: "Triggered",
      sortable: true,
      render: (record) => (
        <span className="text-sm text-muted-foreground">
          {new Date(record.triggeredAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "acknowledgedAt",
      header: "Acknowledged",
      render: (record) => (
        <span className="text-sm text-muted-foreground">
          {record.acknowledgedAt
            ? new Date(record.acknowledgedAt).toLocaleString()
            : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (record) =>
        record.status === "triggered" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAcknowledge(record.id)}
            disabled={acknowledgeAlert.isPending}
          >
            Acknowledge
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alerts</h1>
          <p className="text-muted-foreground">
            Configure notification channels and alert policies
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="channels" className="space-y-6">
        <TabsList>
          <TabsTrigger value="channels">
            Channels
            {channelsMeta && channelsMeta.total > 0 && (
              <Badge variant="secondary" className="ml-2">
                {channelsMeta.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="policies">
            Policies
            {policiesMeta && policiesMeta.total > 0 && (
              <Badge variant="secondary" className="ml-2">
                {policiesMeta.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            History
            {historyMeta && historyMeta.total > 0 && (
              <Badge variant="secondary" className="ml-2">
                {historyMeta.total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Channels Tab */}
        <TabsContent value="channels" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Notification destinations for your alerts
            </p>
            <Button onClick={handleCreateChannel}>
              <Plus className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
          </div>

          {channelsLoading ? (
            <LoadingState variant="card" count={4} />
          ) : channelsError ? (
            <ErrorState error={channelsError} onRetry={() => refetchChannels()} />
          ) : channels && channels.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {channels.map((channel) => (
                  <AlertChannelCard
                    key={channel.id}
                    channel={channel}
                    onEdit={() => handleEditChannel(channel)}
                    onDelete={() => handleDeleteChannelClick(channel.id)}
                    onTest={() => handleTestChannel(channel.id)}
                    onToggleEnabled={() => handleToggleChannelEnabled(channel)}
                    isTestPending={testingChannelId === channel.id}
                  />
                ))}
              </div>
              {channelsMeta && (
                <Pagination
                  {...getPaginationProps(channelsMeta, channels.length, channelsPagination.setPage, "channels")}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={Bell}
              title="Add your first notification provider"
              description="Set up notification channels like Slack, Discord, Teams, or Email to receive alerts when your monitors detect issues."
              action={{
                label: "Add Notification Provider",
                onClick: handleCreateChannel,
                icon: Plus,
              }}
            />
          )}
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Rules that define when and how to send alerts
            </p>
            <Button onClick={handleCreatePolicy}>
              <Plus className="mr-2 h-4 w-4" />
              Add Policy
            </Button>
          </div>

          {policiesLoading ? (
            <LoadingState variant="card" count={4} />
          ) : policiesError ? (
            <ErrorState error={policiesError} onRetry={() => refetchPolicies()} />
          ) : policies && policies.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {policies.map((policy) => (
                  <AlertPolicyCard
                    key={policy.id}
                    policy={policy}
                    channelCount={policy.channels?.length ?? 0}
                    monitorCount={policyMonitorCounts?.[policy.id] ?? 0}
                    onEdit={() => handleEditPolicy(policy)}
                    onDelete={() => handleDeletePolicyClick(policy.id)}
                    onToggleEnabled={() => handleTogglePolicyEnabled(policy)}
                  />
                ))}
              </div>
              {policiesMeta && (
                <Pagination
                  {...getPaginationProps(policiesMeta, policies.length, policiesPagination.setPage, "policies")}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={Bell}
              title="No alert policies"
              description="Create an alert policy to define when notifications should be sent."
              action={{
                label: "Add Policy",
                onClick: handleCreatePolicy,
                icon: Plus,
              }}
            />
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Recent alert history and notifications
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  {historyStatusFilter === "all"
                    ? "All Status"
                    : HISTORY_STATUS_OPTIONS.find((o) => o.value === historyStatusFilter)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {HISTORY_STATUS_OPTIONS.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={historyStatusFilter === option.value}
                    onCheckedChange={() => setHistoryStatusFilter(option.value)}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {historyLoading ? (
            <LoadingState variant="table" count={5} />
          ) : historyError ? (
            <ErrorState error={historyError} onRetry={() => refetchHistory()} />
          ) : history && history.length > 0 ? (
            <>
              <DataTable
                data={history}
                columns={historyColumns}
                keyExtractor={(r) => r.id}
              />
              {historyMeta && (
                <Pagination
                  {...getPaginationProps(historyMeta, history.length, historyPagination.setPage, "alerts")}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={Bell}
              title="No alert history"
              description="When alerts are triggered, they will appear here."
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Channel Type Selector (Step 1) */}
      <ChannelTypeSelector
        open={typeSelectorOpen}
        onOpenChange={setTypeSelectorOpen}
        onSelectType={handleSelectChannelType}
      />

      {/* Channel Dialog (Step 2) */}
      <ChannelDialog
        open={channelDialogOpen}
        onOpenChange={setChannelDialogOpen}
        type={selectedChannelType ?? undefined}
        channel={selectedChannel}
        onSubmit={handleChannelSubmit}
        isSubmitting={createChannel.isPending || updateChannel.isPending}
      />

      {/* Policy Dialog */}
      <PolicyDialog
        open={policyDialogOpen}
        onOpenChange={setPolicyDialogOpen}
        policy={selectedPolicy}
        availableChannels={channels || []}
        availableMonitors={monitors || []}
        availableOncallRotations={oncallRotations || []}
        onSubmit={handlePolicySubmit}
        isSubmitting={createPolicy.isPending || updatePolicy.isPending}
      />

      {/* Delete Channel Confirmation */}
      <Dialog open={deleteChannelDialogOpen} onOpenChange={setDeleteChannelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Channel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this notification channel? Any policies
              using this channel will need to be updated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteChannelDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteChannel}
              disabled={deleteChannel.isPending}
            >
              {deleteChannel.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Policy Confirmation */}
      <Dialog open={deletePolicyDialogOpen} onOpenChange={setDeletePolicyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Policy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this alert policy? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletePolicyDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeletePolicy}
              disabled={deletePolicy.isPending}
            >
              {deletePolicy.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

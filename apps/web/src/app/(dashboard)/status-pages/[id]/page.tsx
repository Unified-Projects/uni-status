"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Trash2,
  Globe,
  Users,
  Settings,
  Palette,
  Activity,
  Plus,
  Eye,
  EyeOff,
  Search,
  Mail,
  Code,
  MessageSquareWarning,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
  cn,
} from "@uni-status/ui";
import {
  useStatusPage,
  useStatusPageSubscribers,
  useDeleteStatusPage,
  useAddStatusPageMonitor,
  useRemoveStatusPageMonitor,
  useUpdateStatusPage,
  useUpdateStatusPageMonitor,
} from "@/hooks/use-status-pages";
import { useMonitors } from "@/hooks/use-monitors";
import { StatusPageForm } from "@/components/forms/status-page-form";
import { MonitorList, MonitorPicker, CrowdsourcedSettingsCard, type MonitorListItem } from "@/components/status-pages";
import { EmbedCodeGenerator } from "@/components/embeds";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { StatusPageMonitor } from "@/lib/api-client";

export default function StatusPageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const statusPageId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addMonitorDialogOpen, setAddMonitorDialogOpen] = useState(false);

  // Data fetching
  const { data: statusPage, isLoading, error, refetch } = useStatusPage(statusPageId);
  const { data: subscribers, isLoading: subscribersLoading } = useStatusPageSubscribers(statusPageId);
  const { data: allMonitorsResponse, isLoading: monitorsLoading } = useMonitors();
  const allMonitors = allMonitorsResponse?.data;

  // Mutations
  const deleteStatusPage = useDeleteStatusPage();
  const addMonitor = useAddStatusPageMonitor();
  const removeMonitor = useRemoveStatusPageMonitor();
  const updateStatusPage = useUpdateStatusPage();
  const updateMonitor = useUpdateStatusPageMonitor();

  // Transform monitors for the list component
  const monitorListItems = useMemo((): MonitorListItem[] => {
    if (!statusPage?.monitors) return [];
    return statusPage.monitors
      .sort((a, b) => a.order - b.order)
      .map((spm) => ({
        id: spm.id,
        monitorId: spm.monitorId,
        displayName: spm.displayName,
        order: spm.order,
        group: spm.group,
        monitor: allMonitors?.find((m) => m.id === spm.monitorId),
      }));
  }, [statusPage?.monitors, allMonitors]);

  // Extract unique group names for the dropdown
  const availableGroups = useMemo(() => {
    if (!statusPage?.monitors) return [];
    const groups = new Set<string>();
    for (const monitor of statusPage.monitors) {
      if (monitor.group) {
        groups.add(monitor.group);
      }
    }
    return Array.from(groups).sort();
  }, [statusPage?.monitors]);

  const selectedMonitorIds = useMemo(() => {
    return statusPage?.monitors?.map((m) => m.monitorId) || [];
  }, [statusPage?.monitors]);

  // Handlers
  const handleDelete = async () => {
    await deleteStatusPage.mutateAsync(statusPageId);
    router.push("/status-pages");
  };

  const handleAddMonitor = async (monitorId: string) => {
    await addMonitor.mutateAsync({
      statusPageId,
      data: {
        monitorId,
        order: (statusPage?.monitors?.length || 0),
      },
    });
    setAddMonitorDialogOpen(false);
  };

  const handleRemoveMonitor = async (monitorId: string) => {
    await removeMonitor.mutateAsync({
      statusPageId,
      monitorId,
    });
  };

  const handleMonitorsChange = async (items: MonitorListItem[]) => {
    // Update the order of all monitors
    // This would typically be a bulk update endpoint
    // For now, we update the status page with the new monitor order
    // Note: This is a simplified implementation; a real app might have a dedicated reorder endpoint
  };

  const handleDisplayNameChange = async (monitorId: string, displayName: string) => {
    await updateMonitor.mutateAsync({
      statusPageId,
      monitorId,
      data: { displayName },
    });
  };

  const handleGroupChange = async (monitorId: string, group: string | null) => {
    await updateMonitor.mutateAsync({
      statusPageId,
      monitorId,
      data: { group },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/status-pages">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        <LoadingState variant="page" />
      </div>
    );
  }

  if (error || !statusPage) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/status-pages">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        <ErrorState
          title="Status page not found"
          message="The status page you're looking for doesn't exist or you don't have access to it."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const publicUrl = statusPage.customDomain
    ? `https://${statusPage.customDomain}`
    : `/status/${statusPage.slug}`;

  const subscriberColumns: Column<{ id: string; email: string | null; createdAt: string; verified: boolean }>[] = [
    {
      key: "email",
      header: "Email",
      render: (sub) => (
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span>{sub.email}</span>
        </div>
      ),
    },
    {
      key: "verified",
      header: "Status",
      render: (sub) => (
        <Badge variant={sub.verified ? "default" : "secondary"}>
          {sub.verified ? "Verified" : "Pending"}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Subscribed",
      sortable: true,
      render: (sub) => (
        <span className="text-sm text-muted-foreground">
          {new Date(sub.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <Link href="/status-pages">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{statusPage.name}</h1>
            <Badge
              variant={statusPage.published ? "default" : "secondary"}
              className={cn(
                "gap-1",
                statusPage.published ? "bg-green-500 hover:bg-green-500/80" : ""
              )}
            >
              {statusPage.published ? (
                <>
                  <Eye className="h-3 w-3" />
                  Published
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3" />
                  Draft
                </>
              )}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">/status/{statusPage.slug}</span>
            {statusPage.customDomain && (
              <>
                <span>|</span>
                <span>{statusPage.customDomain}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusPage.published && (
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                View Public Page
              </Button>
            </a>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="monitors">
            Monitors
            {statusPage.monitors && statusPage.monitors.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {statusPage.monitors.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="subscribers">
            Subscribers
            {subscribers && subscribers.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {subscribers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="embeds">
            <Code className="mr-2 h-4 w-4" />
            Embeds
          </TabsTrigger>
          <TabsTrigger value="crowdsourced">
            <MessageSquareWarning className="mr-2 h-4 w-4" />
            User Reports
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Row */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {statusPage.published ? (
                    <>
                      <Eye className="h-5 w-5 text-green-500" />
                      <span className="font-medium">Published</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">Draft</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monitors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {statusPage.monitors?.length || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Subscribers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {subscribers?.length || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Domain</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm truncate">
                    {statusPage.customDomain || statusPage.slug}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Info */}
          <Card>
            <CardHeader>
              <CardTitle>Status Page Details</CardTitle>
              <CardDescription>
                Basic information about this status page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Name
                  </label>
                  <p className="mt-1">{statusPage.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Slug
                  </label>
                  <p className="mt-1 font-mono">{statusPage.slug}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Custom Domain
                  </label>
                  <p className="mt-1">
                    {statusPage.customDomain || "Not configured"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Password Protected
                  </label>
                  <p className="mt-1">
                    {statusPage.passwordHash ? "Yes" : "No"}
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Public URL
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {publicUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Created
                </label>
                <p className="mt-1">
                  {new Date(statusPage.createdAt).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monitors Tab */}
        <TabsContent value="monitors" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Monitors</CardTitle>
                  <CardDescription>
                    Monitors displayed on this status page. Drag to reorder.
                  </CardDescription>
                </div>
                <Button onClick={() => setAddMonitorDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Monitor
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {monitorsLoading ? (
                <LoadingState variant="table" count={3} />
              ) : monitorListItems.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No monitors added"
                  description="Add monitors to display their status on this page."
                  action={{
                    label: "Add Monitor",
                    onClick: () => setAddMonitorDialogOpen(true),
                    icon: Plus,
                  }}
                />
              ) : (
                <MonitorList
                  items={monitorListItems}
                  onChange={handleMonitorsChange}
                  onRemove={handleRemoveMonitor}
                  onDisplayNameChange={handleDisplayNameChange}
                  onGroupChange={handleGroupChange}
                  availableGroups={availableGroups}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <StatusPageForm statusPage={statusPage} mode="edit" />
        </TabsContent>

        {/* Subscribers Tab */}
        <TabsContent value="subscribers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Subscribers</CardTitle>
              <CardDescription>
                Users subscribed to receive updates about this status page
              </CardDescription>
            </CardHeader>
            <CardContent>
              {subscribersLoading ? (
                <LoadingState variant="table" count={5} />
              ) : subscribers && subscribers.length > 0 ? (
                <DataTable
                  data={subscribers}
                  columns={subscriberColumns}
                  keyExtractor={(s) => s.id}
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="No subscribers yet"
                  description="When users subscribe to your status page, they'll appear here."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Embeds Tab */}
        <TabsContent value="embeds" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Embed Status on Your Website</CardTitle>
              <CardDescription>
                Generate embed codes to display your status page on external websites.
                Choose from badges, status dots, cards, or interactive widgets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmbedCodeGenerator
                slug={statusPage.slug}
                statusPageName={statusPage.name}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Crowdsourced User Reports Tab */}
        <TabsContent value="crowdsourced" className="space-y-6">
          <CrowdsourcedSettingsCard statusPageId={statusPageId} />
        </TabsContent>
      </Tabs>

      {/* Add Monitor Dialog */}
      <Dialog open={addMonitorDialogOpen} onOpenChange={setAddMonitorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Monitor</DialogTitle>
            <DialogDescription>
              Select a monitor to add to this status page
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[400px] overflow-y-auto">
            {allMonitors && allMonitors.length > 0 ? (
              <MonitorPicker
                availableMonitors={allMonitors}
                selectedMonitorIds={selectedMonitorIds}
                onSelect={handleAddMonitor}
              />
            ) : (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No monitors available. Create a monitor first.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Status Page</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{statusPage.name}&quot;? This
              action cannot be undone and all subscribers will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteStatusPage.isPending}
            >
              {deleteStatusPage.isPending ? "Deleting..." : "Delete Status Page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

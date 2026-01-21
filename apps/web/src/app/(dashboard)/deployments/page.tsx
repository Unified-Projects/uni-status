"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination, DEFAULT_PAGE_SIZE, getPaginationProps } from "@/components/ui/pagination";
import {
  Plus,
  Rocket,
  Webhook,
  GitBranch,
  GitCommit,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  MoreVertical,
  Trash2,
  Key,
  Copy,
  Link2,
  Unlink,
  Activity,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Alert,
  AlertDescription,
  AlertTitle,
} from "@uni-status/ui";
import { apiClient, type DeploymentEvent, type DeploymentWebhook, type DeploymentStats } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";

export default function DeploymentsPage() {
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useDashboardStore();
  const [activeTab, setActiveTab] = useState("events");
  const [createWebhookDialogOpen, setCreateWebhookDialogOpen] = useState(false);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [newWebhookData, setNewWebhookData] = useState<{ secret: string; webhookUrl: string } | null>(null);

  // Form state
  const [webhookFormData, setWebhookFormData] = useState({
    name: "",
    description: "",
  });

  // Pagination
  const { page, setPage, paginationParams } = usePagination();

  const {
    data: eventsResponse,
    isLoading: eventsLoading,
    error: eventsError,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ["deployments", "events", currentOrganizationId, paginationParams],
    queryFn: () => apiClient.deployments.events.list(paginationParams, currentOrganizationId || undefined),
    enabled: !!currentOrganizationId,
  });

  const events = eventsResponse?.data;
  const eventsMeta = eventsResponse?.meta;

  const {
    data: webhooks,
    isLoading: webhooksLoading,
    error: webhooksError,
    refetch: refetchWebhooks,
  } = useQuery({
    queryKey: ["deployments", "webhooks", currentOrganizationId],
    queryFn: () => apiClient.deployments.webhooks.list(currentOrganizationId || undefined),
    enabled: !!currentOrganizationId,
  });

  const {
    data: stats,
    isLoading: statsLoading,
  } = useQuery({
    queryKey: ["deployments", "stats", currentOrganizationId],
    queryFn: () => apiClient.deployments.stats(30, currentOrganizationId || undefined),
    enabled: !!currentOrganizationId,
  });

  const createWebhook = useMutation({
    mutationFn: (data: typeof webhookFormData) =>
      apiClient.deployments.webhooks.create(data, currentOrganizationId || undefined),
    onSuccess: async (data) => {
      // Wait for the query to be invalidated and refetched before closing dialogs
      await queryClient.invalidateQueries({ queryKey: ["deployments", "webhooks"] });
      setCreateWebhookDialogOpen(false);
      setWebhookFormData({ name: "", description: "" });
      // Show the secret
      setNewWebhookData({
        secret: (data as any).secret,
        webhookUrl: (data as any).webhookUrl,
      });
      setSecretDialogOpen(true);
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) =>
      apiClient.deployments.webhooks.delete(id, currentOrganizationId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployments", "webhooks"] });
    },
  });

  const regenerateSecret = useMutation({
    mutationFn: (id: string) =>
      apiClient.deployments.webhooks.regenerateSecret(id, currentOrganizationId || undefined),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deployments", "webhooks"] });
      setNewWebhookData({
        secret: (data as any).secret,
        webhookUrl: "",
      });
      setSecretDialogOpen(true);
    },
  });

  const handleCreateWebhook = () => {
    createWebhook.mutate(webhookFormData);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="mr-1 h-3 w-3" /> Completed
          </Badge>
        );
      case "started":
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> In Progress
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" /> Failed
          </Badge>
        );
      case "rolled_back":
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-600">
            <AlertTriangle className="mr-1 h-3 w-3" /> Rolled Back
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Deployments</h1>
          <p className="text-muted-foreground">
            Track deployments and correlate with incidents
          </p>
        </div>
      </div>

      {/* Stats Summary */}
      {stats && !statsLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Deployments (30d)</CardDescription>
              <CardTitle className="text-3xl">
                {Object.values(stats.byStatus).reduce((a, b) => a + b, 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Successful</CardDescription>
              <CardTitle className="text-3xl text-green-600">
                {stats.byStatus.completed || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed</CardDescription>
              <CardTitle className="text-3xl text-red-600">
                {stats.byStatus.failed || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Correlated Incidents</CardDescription>
              <CardTitle className="text-3xl text-yellow-600">
                {Object.values(stats.correlations).reduce((a, b) => a + b, 0)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="events">Deployment Events</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-6">
          {eventsLoading ? (
            <LoadingState variant="card" count={3} />
          ) : eventsError ? (
            <ErrorState error={eventsError} onRetry={() => refetchEvents()} />
          ) : events?.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title="No deployments tracked yet"
              description="Set up a webhook to receive deployment events from your CI/CD pipeline."
              action={{
                label: "Set Up Webhook",
                onClick: () => {
                  setActiveTab("webhooks");
                  setCreateWebhookDialogOpen(true);
                },
                icon: Webhook,
              }}
            />
          ) : (
            <>
              <div className="space-y-4">
                {events?.map((event) => (
                  <Card key={event.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg">{event.service}</CardTitle>
                            {event.version && (
                              <Badge variant="outline">{event.version}</Badge>
                            )}
                          </div>
                          <CardDescription>
                            {event.environment} environment
                          </CardDescription>
                        </div>
                        {getStatusBadge(event.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {format(new Date(event.deployedAt), "MMM d, yyyy h:mm a")}
                          </span>
                          {event.branch && (
                            <span className="flex items-center gap-1">
                              <GitBranch className="h-4 w-4" />
                              {event.branch}
                            </span>
                          )}
                          {event.commitSha && (
                            <span className="flex items-center gap-1">
                              <GitCommit className="h-4 w-4" />
                              {event.commitSha.substring(0, 7)}
                            </span>
                          )}
                          {event.deployedBy && (
                            <span>by {event.deployedBy}</span>
                          )}
                        </div>
                        {event.commitMessage && (
                          <p className="text-sm">{event.commitMessage}</p>
                        )}
                        {event.incidentLinks && event.incidentLinks.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            <span className="text-sm font-medium flex items-center gap-1">
                              <Link2 className="h-4 w-4" />
                              Linked Incidents:
                            </span>
                            {event.incidentLinks.map((link) => (
                              <Badge
                                key={link.id}
                                variant={
                                  link.incident.severity === "critical"
                                    ? "destructive"
                                    : link.incident.severity === "major"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {link.incident.title}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {eventsMeta && events && (
                <Pagination
                  {...getPaginationProps(eventsMeta, events.length, setPage, "deployments")}
                />
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="webhooks" className="mt-6">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setCreateWebhookDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Webhook
            </Button>
          </div>

          {webhooksLoading ? (
            <LoadingState variant="card" count={2} />
          ) : webhooksError ? (
            <ErrorState error={webhooksError} onRetry={() => refetchWebhooks()} />
          ) : webhooks?.length === 0 ? (
            <EmptyState
              icon={Webhook}
              title="No webhooks configured"
              description="Create a webhook to receive deployment events from CI/CD platforms like GitHub, GitLab, or Vercel."
              action={{
                label: "Create Webhook",
                onClick: () => setCreateWebhookDialogOpen(true),
                icon: Plus,
              }}
            />
          ) : (
            <div className="space-y-4">
              {webhooks?.map((webhook) => (
                <Card key={webhook.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{webhook.name}</CardTitle>
                        <CardDescription>
                          {webhook.description || "No description"}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={webhook.active ? "default" : "secondary"}>
                          {webhook.active ? "Active" : "Inactive"}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => regenerateSecret.mutate(webhook.id)}
                            >
                              <Key className="mr-2 h-4 w-4" />
                              Regenerate Secret
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => deleteWebhook.mutate(webhook.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p className="text-muted-foreground">
                        Webhook URL:{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          {process.env.NEXT_PUBLIC_API_URL || "/api"}
                          {webhook.webhookUrl || `/api/v1/deployments/webhook/${webhook.id}/events`}
                        </code>
                      </p>
                      <p className="text-muted-foreground">
                        Created: {format(new Date(webhook.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Webhook Dialog */}
      <Dialog open={createWebhookDialogOpen} onOpenChange={setCreateWebhookDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Deployment Webhook</DialogTitle>
            <DialogDescription>
              Create a webhook endpoint to receive deployment events.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={webhookFormData.name}
                onChange={(e) => setWebhookFormData({ ...webhookFormData, name: e.target.value })}
                placeholder="e.g., GitHub Actions"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={webhookFormData.description}
                onChange={(e) =>
                  setWebhookFormData({ ...webhookFormData, description: e.target.value })
                }
                placeholder="Describe this webhook..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateWebhookDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateWebhook}
              disabled={createWebhook.isPending || !webhookFormData.name}
            >
              {createWebhook.isPending ? "Creating..." : "Create Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Display Dialog */}
      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook Created Successfully</DialogTitle>
            <DialogDescription>
              Save this secret now. It will only be shown once!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Copy this secret now and configure it in your CI/CD platform. Use it to sign
                requests with the X-Signature-256 header.
              </AlertDescription>
            </Alert>
            {newWebhookData && (
              <>
                <div className="space-y-2">
                  <Label>Signing Secret</Label>
                  <div className="flex gap-2">
                    <Input value={newWebhookData.secret} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(newWebhookData.secret)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {newWebhookData.webhookUrl && (
                  <div className="space-y-2">
                    <Label>Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value={`${process.env.NEXT_PUBLIC_API_URL || "/api"}${newWebhookData.webhookUrl}`}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(
                            `${process.env.NEXT_PUBLIC_API_URL || "/api"}${newWebhookData.webhookUrl}`
                          )
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setSecretDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

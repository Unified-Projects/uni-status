"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subDays, subMonths } from "date-fns";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination, getPaginationProps } from "@/components/ui/pagination";
import type { PaginationMeta } from "@/lib/api-client";
import {
  Plus,
  BarChart3,
  Download,
  Calendar,
  FileText,
  Clock,
  RefreshCw,
  MoreVertical,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
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
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Checkbox,
} from "@uni-status/ui";
import { apiClient, type SlaReport, type ReportSettings } from "@/lib/api-client";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useMonitors } from "@/hooks/use-monitors";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const { currentOrganizationId } = useDashboardStore();
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("reports");

  // Form state for generating reports
  const [generateForm, setGenerateForm] = useState({
    reportType: "sla",
    periodStart: format(subMonths(new Date(), 1), "yyyy-MM-dd"),
    periodEnd: format(new Date(), "yyyy-MM-dd"),
    includeAllMonitors: true,
    monitorIds: [] as string[],
  });

  // Form state for creating scheduled reports
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    reportType: "sla" as "sla" | "uptime" | "incident" | "executive",
    frequency: "monthly" as "weekly" | "monthly" | "quarterly" | "annually",
    includeAllMonitors: true,
    monitorIds: [] as string[],
    includeCharts: true,
    includeIncidents: true,
    includeMaintenanceWindows: true,
    includeResponseTimes: true,
    includeSloStatus: true,
    recipients: [] as string[],
    recipientInput: "",
    dayOfWeek: 1, // Monday
    dayOfMonth: 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const { data: monitorsResponse } = useMonitors();
  const monitors = monitorsResponse?.data;

  // Pagination for each tab
  const reportsPagination = usePagination();
  const settingsPagination = usePagination();

  const {
    data: reportsResponse,
    isLoading: reportsLoading,
    error: reportsError,
    refetch: refetchReports,
  } = useQuery<{ data: SlaReport[]; meta?: PaginationMeta }>({
    queryKey: ["reports", currentOrganizationId, reportsPagination.paginationParams],
    queryFn: () => apiClient.reports.list(reportsPagination.paginationParams, currentOrganizationId || undefined),
    enabled: !!currentOrganizationId,
    // Auto-refresh while any report is generating/pending
    refetchInterval: (query) =>
      query.state.data?.data?.some((r) => r.status !== "completed") ? 3000 : false,
  });

  const reports = reportsResponse?.data;
  const reportsMeta = reportsResponse?.meta;

  const {
    data: settingsResponse,
    isLoading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useQuery<{ data: ReportSettings[]; meta?: PaginationMeta }>({
    queryKey: ["reports", "settings", currentOrganizationId, settingsPagination.paginationParams],
    queryFn: () => apiClient.reports.settings.list(settingsPagination.paginationParams, currentOrganizationId || undefined),
    enabled: !!currentOrganizationId,
  });

  const settings = settingsResponse?.data;
  const settingsMeta = settingsResponse?.meta;

  const generateReport = useMutation({
    mutationFn: (data: typeof generateForm) =>
      apiClient.reports.generate(
        {
          reportType: data.reportType,
          periodStart: new Date(data.periodStart).toISOString(),
          periodEnd: new Date(data.periodEnd).toISOString(),
          includeAllMonitors: data.includeAllMonitors,
          monitorIds: data.includeAllMonitors ? undefined : data.monitorIds,
        },
        currentOrganizationId || undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      setGenerateDialogOpen(false);
    },
  });

  const createSchedule = useMutation({
    mutationFn: (data: typeof scheduleForm) =>
      apiClient.reports.settings.create(
        {
          name: data.name,
          reportType: data.reportType,
          frequency: data.frequency,
          includeAllMonitors: data.includeAllMonitors,
          monitorIds: data.includeAllMonitors ? [] : data.monitorIds,
          statusPageIds: [],
          includeCharts: data.includeCharts,
          includeIncidents: data.includeIncidents,
          includeMaintenanceWindows: data.includeMaintenanceWindows,
          includeResponseTimes: data.includeResponseTimes,
          includeSloStatus: data.includeSloStatus,
          recipients: { emails: data.recipients },
          dayOfWeek: data.frequency === "weekly" ? data.dayOfWeek : null,
          dayOfMonth: data.frequency !== "weekly" ? data.dayOfMonth : null,
          timezone: data.timezone,
          active: true,
        },
        currentOrganizationId || undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", "settings"] });
      setScheduleDialogOpen(false);
      // Reset form
      setScheduleForm({
        name: "",
        reportType: "sla",
        frequency: "monthly",
        includeAllMonitors: true,
        monitorIds: [],
        includeCharts: true,
        includeIncidents: true,
        includeMaintenanceWindows: true,
        includeResponseTimes: true,
        includeSloStatus: true,
        recipients: [],
        recipientInput: "",
        dayOfWeek: 1,
        dayOfMonth: 1,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
  });

  const handleGenerate = () => {
    generateReport.mutate(generateForm);
  };

  const handleCreateSchedule = () => {
    if (!scheduleForm.name.trim()) return;
    createSchedule.mutate(scheduleForm);
  };

  const addRecipient = () => {
    const email = scheduleForm.recipientInput.trim();
    if (email && !scheduleForm.recipients.includes(email)) {
      setScheduleForm({
        ...scheduleForm,
        recipients: [...scheduleForm.recipients, email],
        recipientInput: "",
      });
    }
  };

  const removeRecipient = (email: string) => {
    setScheduleForm({
      ...scheduleForm,
      recipients: scheduleForm.recipients.filter((r) => r !== email),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="mr-1 h-3 w-3" /> Completed
          </Badge>
        );
      case "pending":
      case "generating":
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Generating
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" /> Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getReportTypeLabel = (type: string) => {
    switch (type) {
      case "sla":
        return "SLA Report";
      case "uptime":
        return "Uptime Report";
      case "incident":
        return "Incident Report";
      case "executive":
        return "Executive Summary";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            Generate and manage SLA and uptime reports
          </p>
        </div>
        <Button onClick={() => setGenerateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generate Report
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="reports">Generated Reports</TabsTrigger>
          <TabsTrigger value="settings">Scheduled Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6">
          {reportsLoading ? (
            <LoadingState variant="card" count={3} />
          ) : reportsError ? (
            <ErrorState error={reportsError} onRetry={() => refetchReports()} />
          ) : reports?.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No reports generated yet"
              description="Generate your first report to see analytics and metrics."
              action={{
                label: "Generate Report",
                onClick: () => setGenerateDialogOpen(true),
                icon: Plus,
              }}
            />
          ) : (
            <>
              <div className="space-y-4">
                {reports?.map((report) => (
                  <Card key={report.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {getReportTypeLabel(report.reportType)}
                          </CardTitle>
                          <CardDescription>
                            {format(new Date(report.periodStart), "MMM d, yyyy")} -{" "}
                            {format(new Date(report.periodEnd), "MMM d, yyyy")}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(report.status)}
                          {report.status === "completed" && report.fileUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                window.open(`/api/v1/reports/${report.id}/download`, "_blank")
                              }
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Created {format(new Date(report.createdAt), "MMM d, yyyy h:mm a")}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-4 w-4" />
                          {report.includedMonitors.length} monitors
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {reportsMeta && reports && (
                <Pagination
                  {...getPaginationProps(reportsMeta, reports.length, reportsPagination.setPage, "reports")}
                />
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          {settingsLoading ? (
            <LoadingState variant="card" count={2} />
          ) : settingsError ? (
            <ErrorState error={settingsError} onRetry={() => refetchSettings()} />
          ) : settings?.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No scheduled reports"
              description="Set up automated report generation on a schedule."
              action={{
                label: "Create Schedule",
                onClick: () => setScheduleDialogOpen(true),
                icon: Plus,
              }}
            />
          ) : (
            <>
              <div className="space-y-4">
                {settings?.map((setting) => (
                  <Card key={setting.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{setting.name}</CardTitle>
                          <CardDescription>
                            {getReportTypeLabel(setting.reportType)} - {setting.frequency}
                          </CardDescription>
                        </div>
                        <Badge variant={setting.active ? "default" : "secondary"}>
                          {setting.active ? "Active" : "Paused"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {setting.nextScheduledAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Next: {format(new Date(setting.nextScheduledAt), "MMM d, yyyy")}
                          </span>
                        )}
                        <span>
                          {setting.includeAllMonitors
                            ? "All monitors"
                            : `${setting.monitorIds.length} monitors`}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {settingsMeta && settings && (
                <Pagination
                  {...getPaginationProps(settingsMeta, settings.length, settingsPagination.setPage, "scheduled reports")}
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Generate Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Report</DialogTitle>
            <DialogDescription>
              Create a new report for the selected time period.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reportType">Report Type</Label>
              <Select
                value={generateForm.reportType}
                onValueChange={(value) => setGenerateForm({ ...generateForm, reportType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sla">SLA Report</SelectItem>
                  <SelectItem value="uptime">Uptime Report</SelectItem>
                  <SelectItem value="incident">Incident Report</SelectItem>
                  <SelectItem value="executive">Executive Summary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="periodStart">Start Date</Label>
                <Input
                  id="periodStart"
                  type="date"
                  value={generateForm.periodStart}
                  onChange={(e) =>
                    setGenerateForm({ ...generateForm, periodStart: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">End Date</Label>
                <Input
                  id="periodEnd"
                  type="date"
                  value={generateForm.periodEnd}
                  onChange={(e) =>
                    setGenerateForm({ ...generateForm, periodEnd: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeAllMonitors"
                checked={generateForm.includeAllMonitors}
                onCheckedChange={(checked) =>
                  setGenerateForm({ ...generateForm, includeAllMonitors: checked as boolean })
                }
              />
              <Label htmlFor="includeAllMonitors">Include all monitors</Label>
            </div>
            {!generateForm.includeAllMonitors && (
              <div className="space-y-2">
                <Label>Select Monitors</Label>
                <div className="max-h-48 overflow-y-auto space-y-2 rounded border p-2">
                  {monitors?.map((monitor) => (
                    <div key={monitor.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`monitor-${monitor.id}`}
                        checked={generateForm.monitorIds.includes(monitor.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setGenerateForm({
                              ...generateForm,
                              monitorIds: [...generateForm.monitorIds, monitor.id],
                            });
                          } else {
                            setGenerateForm({
                              ...generateForm,
                              monitorIds: generateForm.monitorIds.filter((id) => id !== monitor.id),
                            });
                          }
                        }}
                      />
                      <Label htmlFor={`monitor-${monitor.id}`} className="text-sm">
                        {monitor.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generateReport.isPending}>
              {generateReport.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Report"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Scheduled Report</DialogTitle>
            <DialogDescription>
              Set up automated report generation on a schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Schedule Name */}
            <div className="space-y-2">
              <Label htmlFor="scheduleName">Schedule Name</Label>
              <Input
                id="scheduleName"
                placeholder="e.g., Weekly SLA Report"
                value={scheduleForm.name}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, name: e.target.value })
                }
              />
            </div>

            {/* Report Type */}
            <div className="space-y-2">
              <Label htmlFor="scheduleReportType">Report Type</Label>
              <Select
                value={scheduleForm.reportType}
                onValueChange={(value: "sla" | "uptime" | "incident" | "executive") =>
                  setScheduleForm({ ...scheduleForm, reportType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sla">SLA Report</SelectItem>
                  <SelectItem value="uptime">Uptime Report</SelectItem>
                  <SelectItem value="incident">Incident Report</SelectItem>
                  <SelectItem value="executive">Executive Summary</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="scheduleFrequency">Frequency</Label>
              <Select
                value={scheduleForm.frequency}
                onValueChange={(value: "weekly" | "monthly" | "quarterly" | "annually") =>
                  setScheduleForm({ ...scheduleForm, frequency: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Day of Week (for weekly) */}
            {scheduleForm.frequency === "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="dayOfWeek">Day of Week</Label>
                <Select
                  value={scheduleForm.dayOfWeek.toString()}
                  onValueChange={(value) =>
                    setScheduleForm({ ...scheduleForm, dayOfWeek: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Day of Month (for monthly/quarterly/annually) */}
            {scheduleForm.frequency !== "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="dayOfMonth">Day of Month</Label>
                <Select
                  value={scheduleForm.dayOfMonth.toString()}
                  onValueChange={(value) =>
                    setScheduleForm({ ...scheduleForm, dayOfMonth: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={scheduleForm.timezone}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, timezone: e.target.value })
                }
              />
            </div>

            {/* Recipients */}
            <div className="space-y-2">
              <Label>Email Recipients</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com"
                  value={scheduleForm.recipientInput}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, recipientInput: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRecipient();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addRecipient}>
                  Add
                </Button>
              </div>
              {scheduleForm.recipients.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {scheduleForm.recipients.map((email) => (
                    <Badge key={email} variant="secondary" className="flex items-center gap-1">
                      {email}
                      <button
                        type="button"
                        className="ml-1 hover:text-destructive"
                        onClick={() => removeRecipient(email)}
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Monitor Selection */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="scheduleIncludeAllMonitors"
                checked={scheduleForm.includeAllMonitors}
                onCheckedChange={(checked) =>
                  setScheduleForm({ ...scheduleForm, includeAllMonitors: checked as boolean })
                }
              />
              <Label htmlFor="scheduleIncludeAllMonitors">Include all monitors</Label>
            </div>
            {!scheduleForm.includeAllMonitors && (
              <div className="space-y-2">
                <Label>Select Monitors</Label>
                <div className="max-h-32 overflow-y-auto space-y-2 rounded border p-2">
                  {monitors?.map((monitor) => (
                    <div key={monitor.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`schedule-monitor-${monitor.id}`}
                        checked={scheduleForm.monitorIds.includes(monitor.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setScheduleForm({
                              ...scheduleForm,
                              monitorIds: [...scheduleForm.monitorIds, monitor.id],
                            });
                          } else {
                            setScheduleForm({
                              ...scheduleForm,
                              monitorIds: scheduleForm.monitorIds.filter((id) => id !== monitor.id),
                            });
                          }
                        }}
                      />
                      <Label htmlFor={`schedule-monitor-${monitor.id}`} className="text-sm">
                        {monitor.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Report Content Options */}
            <div className="space-y-2">
              <Label>Report Content</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeCharts"
                    checked={scheduleForm.includeCharts}
                    onCheckedChange={(checked) =>
                      setScheduleForm({ ...scheduleForm, includeCharts: checked as boolean })
                    }
                  />
                  <Label htmlFor="includeCharts" className="text-sm">Include charts</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeIncidents"
                    checked={scheduleForm.includeIncidents}
                    onCheckedChange={(checked) =>
                      setScheduleForm({ ...scheduleForm, includeIncidents: checked as boolean })
                    }
                  />
                  <Label htmlFor="includeIncidents" className="text-sm">Include incidents</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeMaintenanceWindows"
                    checked={scheduleForm.includeMaintenanceWindows}
                    onCheckedChange={(checked) =>
                      setScheduleForm({ ...scheduleForm, includeMaintenanceWindows: checked as boolean })
                    }
                  />
                  <Label htmlFor="includeMaintenanceWindows" className="text-sm">Include maintenance</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeResponseTimes"
                    checked={scheduleForm.includeResponseTimes}
                    onCheckedChange={(checked) =>
                      setScheduleForm({ ...scheduleForm, includeResponseTimes: checked as boolean })
                    }
                  />
                  <Label htmlFor="includeResponseTimes" className="text-sm">Include response times</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeSloStatus"
                    checked={scheduleForm.includeSloStatus}
                    onCheckedChange={(checked) =>
                      setScheduleForm({ ...scheduleForm, includeSloStatus: checked as boolean })
                    }
                  />
                  <Label htmlFor="includeSloStatus" className="text-sm">Include SLO status</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSchedule}
              disabled={createSchedule.isPending || !scheduleForm.name.trim()}
            >
              {createSchedule.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Schedule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

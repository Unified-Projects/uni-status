"use client";

import Link from "next/link";
import { Code, Globe, ChevronRight, Info, Activity, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Alert,
  AlertDescription,
  AlertTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@uni-status/ui";
import { useStatusPages } from "@/hooks/use-status-pages";
import { useMonitors } from "@/hooks/use-monitors";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";

export default function EmbedsPage() {
  const { data: statusPagesResponse, isLoading: loadingPages } = useStatusPages();
  const { data: monitorsResponse, isLoading: loadingMonitors } = useMonitors();

  const statusPages = statusPagesResponse?.data;
  const monitors = monitorsResponse?.data;

  const publishedPages = statusPages?.filter((p) => p.published) || [];
  const activeMonitors = monitors?.filter((m) => m.status !== "paused") || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Embeds</h1>
        <p className="text-muted-foreground mt-1">
          Generate embed codes to display your status on external websites
        </p>
      </div>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>About Embeds</AlertTitle>
        <AlertDescription>
          Embeds allow you to display your status page information on other websites.
          Choose from SVG badges, status dots, interactive cards, or self-updating JavaScript widgets.
          Only published status pages can be embedded.
        </AlertDescription>
      </Alert>

      {/* Visual builder */}
      <Card className="bg-gradient-to-r from-emerald-50 to-sky-50 dark:from-emerald-900/30 dark:to-sky-900/30 border-emerald-100 dark:border-emerald-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-700 dark:text-emerald-200" />
            Visual Badge Builder
          </CardTitle>
          <CardDescription>
            Design custom badge palettes, icons, and thresholds, then save them as reusable templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
          <p className="text-sm text-muted-foreground">
            Works for both SVG badges and status dots — perfect for branded embeds.
          </p>
          <Link href="/embeds/badge-generator">
            <Button variant="outline" className="bg-white/70 dark:bg-foreground/5">
              Open Builder
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Embed Types Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Badge className="bg-gray-500">Badge</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              SVG badge showing overall status
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              Dot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Minimal colored indicator with optional pulse animation
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className="w-4 h-3 rounded border" />
              Card
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Themed card with status, monitors, and incidents
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Code className="h-4 w-4" />
              Widget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Self-updating JavaScript widget with real-time status
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Embed Source Selection */}
      <Tabs defaultValue="status-pages" className="space-y-4">
        <TabsList>
          <TabsTrigger value="status-pages" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Status Pages
          </TabsTrigger>
          <TabsTrigger value="monitors" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Individual Monitors
          </TabsTrigger>
        </TabsList>

        {/* Status Pages Tab */}
        <TabsContent value="status-pages">
          <Card>
            <CardHeader>
              <CardTitle>Your Status Pages</CardTitle>
              <CardDescription>
                Select a status page to generate embed codes. Only published status pages can be embedded.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPages ? (
                <LoadingState variant="card" count={3} />
              ) : publishedPages.length === 0 ? (
                <EmptyState
                  icon={Globe}
                  title="No published status pages"
                  description="You need at least one published status page to create embeds."
                  action={{
                    label: "View Status Pages",
                    onClick: () => window.location.href = "/status-pages",
                  }}
                />
              ) : (
                <div className="space-y-2">
                  {publishedPages.map((page) => (
                    <Link
                      key={page.id}
                      href={`/embeds/status-pages/${page.slug}`}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border transition-colors hover:bg-muted/50 block"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{page.name}</p>
                          <p className="text-sm text-muted-foreground font-mono">
                            /status/{page.slug}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="default" className="bg-green-500">
                          Published
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <span>
                            Generate Embed
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </span>
                        </Button>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monitors Tab */}
        <TabsContent value="monitors">
          <Card>
            <CardHeader>
              <CardTitle>Your Monitors</CardTitle>
              <CardDescription>
                Generate embed codes for individual monitors. Useful for showing specific service status on external pages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMonitors ? (
                <LoadingState variant="card" count={3} />
              ) : activeMonitors.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No active monitors"
                  description="You need at least one active monitor to create embeds."
                  action={{
                    label: "View Monitors",
                    onClick: () => window.location.href = "/monitors",
                  }}
                />
              ) : (
                <div className="space-y-2">
                  {activeMonitors.map((monitor) => (
                    <Link
                      key={monitor.id}
                      href={`/embeds/monitors/${monitor.id}`}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border transition-colors hover:bg-muted/50 block"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Activity className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{monitor.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {monitor.type.toUpperCase()} - {monitor.url}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="default"
                          className={cn(
                            monitor.status === "active" && "bg-green-500",
                            monitor.status === "degraded" && "bg-yellow-500",
                            monitor.status === "down" && "bg-red-500",
                            monitor.status === "pending" && "bg-gray-500"
                          )}
                        >
                          {monitor.status === "active" ? "Operational" : monitor.status}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <span>
                            Generate Embed
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </span>
                        </Button>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            You can also access embed settings from each status page&apos;s detail view:
          </p>
          <div className="flex flex-wrap gap-2">
            {publishedPages.slice(0, 5).map((page) => (
              <Link key={page.id} href={`/status-pages/${page.id}?tab=embeds`}>
                <Button variant="outline" size="sm">
                  {page.name}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  MoreHorizontal,
  ExternalLink,
  Pencil,
  Trash2,
  Globe,
  Users,
  Activity,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@uni-status/ui";
import type { StatusPage, StatusPageMonitor } from "@/lib/api-client";

export interface StatusPageCardProps {
  statusPage: StatusPage & { monitors?: StatusPageMonitor[] };
  subscriberCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  variant?: "default" | "compact";
  className?: string;
}

export function StatusPageCard({
  statusPage,
  subscriberCount = 0,
  onEdit,
  onDelete,
  showActions = true,
  variant = "default",
  className,
}: StatusPageCardProps) {
  const monitorCount = statusPage.monitors?.length || 0;
  const publicUrl = statusPage.customDomain
    ? `https://${statusPage.customDomain}`
    : `/status/${statusPage.slug}`;

  if (variant === "compact") {
    return (
      <StatusPageCardCompact
        statusPage={statusPage}
        monitorCount={monitorCount}
        className={className}
      />
    );
  }

  return (
    <Card className={cn("group hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <Link
              href={`/status-pages/${statusPage.id}`}
              className="font-medium truncate hover:underline"
            >
              {statusPage.name}
            </Link>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant={statusPage.published ? "default" : "secondary"}
              className={cn(
                "gap-1",
                statusPage.published
                  ? "bg-green-500 hover:bg-green-500/80"
                  : ""
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
            {showActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/status-pages/${statusPage.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  {statusPage.published && (
                    <DropdownMenuItem asChild>
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Globe className="mr-2 h-4 w-4" />
                        View Public Page
                      </a>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="font-mono text-xs">{statusPage.slug}</span>
          {statusPage.customDomain && (
            <>
              <span className="mx-1">|</span>
              <span className="truncate">{statusPage.customDomain}</span>
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {monitorCount} monitor{monitorCount !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {subscriberCount} subscriber{subscriberCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {statusPage.published && (
          <div className="pt-2">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              View public page
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact variant for lists
function StatusPageCardCompact({
  statusPage,
  monitorCount,
  className,
}: {
  statusPage: StatusPage;
  monitorCount: number;
  className?: string;
}) {
  return (
    <Link
      href={`/status-pages/${statusPage.id}`}
      className={cn(
        "flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors",
        className
      )}
    >
      <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{statusPage.name}</div>
        <div className="text-sm text-muted-foreground font-mono">
          {statusPage.slug}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm text-muted-foreground">
          {monitorCount} monitor{monitorCount !== 1 ? "s" : ""}
        </span>
        <Badge
          variant={statusPage.published ? "default" : "secondary"}
          className={cn(
            statusPage.published ? "bg-green-500 hover:bg-green-500/80" : ""
          )}
        >
          {statusPage.published ? "Published" : "Draft"}
        </Badge>
      </div>
    </Link>
  );
}

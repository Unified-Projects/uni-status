"use client";

import {
  Card,
  CardContent,
  Button,
  Badge,
  cn,
} from "@uni-status/ui";
import { Key, Copy, Trash2, Clock, AlertCircle } from "lucide-react";
import type { ApiKey } from "@/lib/api-client";

export interface ApiKeyCardProps {
  apiKey: ApiKey;
  onCopy: (prefix: string) => void;
  onDelete: (keyId: string) => void;
  isDeleting?: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function getExpiryText(expiresAt: string | null): string {
  if (!expiresAt) return "Never expires";

  const now = new Date();
  const expiry = new Date(expiresAt);
  const diff = expiry.getTime() - now.getTime();

  if (diff <= 0) return "Expired";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 30) return `Expires ${formatDate(expiresAt)}`;
  if (days > 0) return `${days}d until expiry`;
  return "Expires today";
}

function getScopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    read: "Read",
    write: "Write",
    delete: "Delete",
    admin: "Admin",
  };
  return labels[scope] || scope;
}

function getScopeBadgeVariant(scope: string): "default" | "secondary" | "outline" | "destructive" {
  switch (scope) {
    case "admin":
      return "destructive";
    case "delete":
      return "outline";
    case "write":
      return "secondary";
    default:
      return "outline";
  }
}

export function ApiKeyCard({
  apiKey,
  onCopy,
  onDelete,
  isDeleting = false,
}: ApiKeyCardProps) {
  const expired = isExpired(apiKey.expiresAt);
  const expiryText = getExpiryText(apiKey.expiresAt);

  return (
    <Card className={cn(expired && "opacity-75")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Key className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{apiKey.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">
                  {apiKey.keyPrefix}...
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onCopy(apiKey.keyPrefix)}
                >
                  <Copy className="h-3 w-3" />
                  <span className="sr-only">Copy prefix</span>
                </Button>
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(apiKey.id)}
            disabled={isDeleting}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>

        {/* Scopes */}
        <div className="mt-3 flex flex-wrap gap-1">
          {apiKey.scopes.map((scope) => (
            <Badge
              key={scope}
              variant={getScopeBadgeVariant(scope)}
              className="text-xs"
            >
              {getScopeLabel(scope)}
            </Badge>
          ))}
        </div>

        {/* Meta info */}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Created {formatDate(apiKey.createdAt)}</span>
          <div className="flex items-center gap-1">
            {expired ? (
              <>
                <AlertCircle className="h-3 w-3 text-destructive" />
                <span className="text-destructive">{expiryText}</span>
              </>
            ) : (
              <>
                <Clock className="h-3 w-3" />
                <span>{expiryText}</span>
              </>
            )}
          </div>
        </div>

        {apiKey.lastUsedAt && (
          <div className="mt-1 text-xs text-muted-foreground">
            Last used {formatDate(apiKey.lastUsedAt)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

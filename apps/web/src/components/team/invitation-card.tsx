"use client";

import {
  Card,
  CardContent,
  Button,
  Badge,
  cn,
} from "@uni-status/ui";
import { Mail, RefreshCw, X, Clock, AlertCircle } from "lucide-react";
import { MemberRoleBadge, type MemberRole } from "./member-role-badge";
import type { OrganizationInvitation } from "@/lib/api-client";

export interface InvitationCardProps {
  invitation: OrganizationInvitation;
  onResend: (invitationId: string) => void;
  onCancel: (invitationId: string) => void;
  isResending?: boolean;
  isCanceling?: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

function getTimeUntilExpiry(expiresAt: string): string {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diff = expiry.getTime() - now.getTime();

  if (diff <= 0) return "Expired";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  return "< 1h left";
}

export function InvitationCard({
  invitation,
  onResend,
  onCancel,
  isResending = false,
  isCanceling = false,
}: InvitationCardProps) {
  const expired = isExpired(invitation.expiresAt);

  return (
    <Card className={cn(expired && "opacity-75")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{invitation.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <MemberRoleBadge role={invitation.role as MemberRole} />
                {expired ? (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Expired
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="mr-1 h-3 w-3" />
                    {getTimeUntilExpiry(invitation.expiresAt)}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResend(invitation.id)}
              disabled={isResending || isCanceling}
            >
              <RefreshCw className={cn("h-4 w-4 mr-1", isResending && "animate-spin")} />
              {expired ? "Resend" : "Resend"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancel(invitation.id)}
              disabled={isResending || isCanceling}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          Invited {formatDate(invitation.createdAt)}
        </div>
      </CardContent>
    </Card>
  );
}

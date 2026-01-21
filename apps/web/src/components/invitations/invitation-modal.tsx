"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Badge,
} from "@uni-status/ui";
import { Building2, Clock, User } from "lucide-react";
import type { PendingInvitation } from "@/lib/api-client";

interface InvitationModalProps {
  invitation: PendingInvitation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: (invitationId: string) => void;
  onDecline: (invitationId: string) => void;
  isAccepting?: boolean;
  isDeclining?: boolean;
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case "owner":
      return "destructive";
    case "admin":
      return "default";
    case "member":
      return "secondary";
    case "viewer":
      return "outline";
    default:
      return "secondary";
  }
}

function formatExpiryDate(expiresAt: string): string {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "Expired";
  } else if (diffDays === 1) {
    return "Expires in 1 day";
  } else {
    return `Expires in ${diffDays} days`;
  }
}

export function InvitationModal({
  invitation,
  open,
  onOpenChange,
  onAccept,
  onDecline,
  isAccepting = false,
  isDeclining = false,
}: InvitationModalProps) {
  if (!invitation) return null;

  const isLoading = isAccepting || isDeclining;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Organisation</DialogTitle>
          <DialogDescription>
            You&apos;ve been invited to join an organisation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Organization Info */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
              {invitation.organization.logoUrl ? (
                <Image
                  src={invitation.organization.logoUrl}
                  alt={invitation.organization.name}
                  width={48}
                  height={48}
                  className="rounded"
                />
              ) : (
                <Building2 className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{invitation.organization.name}</h3>
              <p className="text-sm text-muted-foreground">@{invitation.organization.slug}</p>
            </div>
          </div>

          {/* Invitation Details */}
          <div className="rounded-lg border p-4 space-y-3">
            {/* Inviter */}
            {invitation.inviter && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Invited by:</span>
                <span className="font-medium">
                  {invitation.inviter.name || invitation.inviter.email}
                </span>
              </div>
            )}

            {/* Role */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Role:</span>
              <Badge variant={getRoleBadgeVariant(invitation.role)}>
                {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
              </Badge>
            </div>

            {/* Expiry */}
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {formatExpiryDate(invitation.expiresAt)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onDecline(invitation.id)}
            disabled={isLoading}
          >
            {isDeclining ? "Declining..." : "Decline"}
          </Button>
          <Button
            onClick={() => onAccept(invitation.id)}
            disabled={isLoading}
          >
            {isAccepting ? "Accepting..." : "Accept Invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

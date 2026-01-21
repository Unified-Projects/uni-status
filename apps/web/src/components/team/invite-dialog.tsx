"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@uni-status/ui";
import { InviteForm } from "./invite-form";

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { email: string; role: "admin" | "member" | "viewer" }) => void;
  isSubmitting?: boolean;
}

export function InviteDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}: InviteDialogProps) {
  const handleSubmit = (data: { email: string; role: "admin" | "member" | "viewer" }) => {
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your organization. They will receive an email with a link to accept.
          </DialogDescription>
        </DialogHeader>
        <InviteForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}

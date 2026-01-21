"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@uni-status/ui";
import { AlertPolicyForm } from "./alert-policy-form";
import type { AlertPolicy, AlertChannel, Monitor } from "@/lib/api-client";

interface PolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: AlertPolicy & { channelIds?: string[]; monitorIds?: string[] };
  availableChannels: AlertChannel[];
  availableMonitors: Monitor[];
  onSubmit: (data: Parameters<typeof AlertPolicyForm>[0] extends { onSubmit: (data: infer T) => unknown } ? T : never) => Promise<void>;
  isSubmitting?: boolean;
}

export function PolicyDialog({
  open,
  onOpenChange,
  policy,
  availableChannels,
  availableMonitors,
  onSubmit,
  isSubmitting = false,
}: PolicyDialogProps) {
  const isEditMode = !!policy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Policy" : "Create Policy"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the alert policy settings"
              : "Configure a new alert policy with conditions and channels"}
          </DialogDescription>
        </DialogHeader>
        <AlertPolicyForm
          policy={policy}
          availableChannels={availableChannels}
          availableMonitors={availableMonitors}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}

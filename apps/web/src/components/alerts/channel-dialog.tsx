"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@uni-status/ui";
import { AlertChannelForm } from "./alert-channel-form";
import { ChannelTypeIcon, getChannelTypeLabel, type AlertChannelType } from "./channel-type-icon";
import type { AlertChannel } from "@/lib/api-client";

interface ChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected channel type for create mode (required when creating) */
  type?: AlertChannelType;
  channel?: AlertChannel;
  onSubmit: (data: Parameters<typeof AlertChannelForm>[0] extends { onSubmit: (data: infer T) => unknown } ? T : never) => Promise<void>;
  isSubmitting?: boolean;
}

export function ChannelDialog({
  open,
  onOpenChange,
  type,
  channel,
  onSubmit,
  isSubmitting = false,
}: ChannelDialogProps) {
  const isEditMode = !!channel;
  const effectiveType = (channel?.type as AlertChannelType) ?? type ?? "email";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ChannelTypeIcon type={effectiveType} size="lg" showBackground />
            <div>
              <DialogTitle>
                {isEditMode
                  ? `Edit ${getChannelTypeLabel(effectiveType)} Channel`
                  : `Configure ${getChannelTypeLabel(effectiveType)}`}
              </DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? "Update your notification channel settings"
                  : `Set up your ${getChannelTypeLabel(effectiveType)} notification channel`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <AlertChannelForm
          type={effectiveType}
          channel={channel}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}

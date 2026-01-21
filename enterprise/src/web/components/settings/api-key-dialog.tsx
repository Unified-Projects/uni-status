"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@uni-status/ui";
import { ApiKeyForm } from "./api-key-form";

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; scopes: string[]; expiresIn?: number }) => void;
  isSubmitting?: boolean;
}

export function ApiKeyDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}: ApiKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Generate a new API key to access the Uni-Status API programmatically.
          </DialogDescription>
        </DialogHeader>
        <ApiKeyForm
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}

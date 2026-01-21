"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Alert,
  AlertDescription,
} from "@uni-status/ui";
import { AlertTriangle } from "lucide-react";

interface DeleteOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationName: string;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteOrgDialog({
  open,
  onOpenChange,
  organizationName,
  onConfirm,
  isDeleting = false,
}: DeleteOrgDialogProps) {
  const [confirmationText, setConfirmationText] = useState("");

  const isConfirmationValid = confirmationText === organizationName;

  const handleClose = () => {
    setConfirmationText("");
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (isConfirmationValid) {
      onConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete Organisation</DialogTitle>
          <DialogDescription>
            This action is permanent and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Deleting this organisation will permanently remove all monitors, incidents,
            status pages, alert configurations, and team members. This data cannot be recovered.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="confirmation">
            Type <span className="font-mono font-bold">{organizationName}</span> to confirm
          </Label>
          <Input
            id="confirmation"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder={organizationName}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isConfirmationValid || isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Organisation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

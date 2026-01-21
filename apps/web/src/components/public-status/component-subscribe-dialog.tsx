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
  Checkbox,
} from "@uni-status/ui";
import { Bell, CheckCircle, Loader2, AlertTriangle } from "lucide-react";

interface ComponentSubscribeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monitorId: string;
  monitorName: string;
  slug: string;
}

// Always use relative URL for public status page API calls to avoid CORS issues on custom domains
const API_URL = "/api";

export function ComponentSubscribeDialog({
  open,
  onOpenChange,
  monitorId,
  monitorName,
  slug,
}: ComponentSubscribeDialogProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notification preferences
  const [notifyOnIncident, setNotifyOnIncident] = useState(true);
  const [notifyOnMaintenance, setNotifyOnMaintenance] = useState(true);
  const [notifyOnStatusChange, setNotifyOnStatusChange] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/public/status-pages/${slug}/components/${monitorId}/subscribe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            email,
            notifyOn: {
              newIncident: notifyOnIncident,
              newMaintenance: notifyOnMaintenance,
              statusChange: notifyOnStatusChange,
            },
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || "Failed to subscribe");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setEmail("");
      setSuccess(false);
      setError(null);
      setNotifyOnIncident(true);
      setNotifyOnMaintenance(true);
      setNotifyOnStatusChange(false);
    }, 300);
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-success-bg">
              <CheckCircle className="h-6 w-6 text-status-success-icon" />
            </div>
            <DialogHeader className="mt-4">
              <DialogTitle className="text-center">Check your email</DialogTitle>
              <DialogDescription className="text-center">
                We sent a verification link to {email}. Please click it to
                confirm your subscription to {monitorName}.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6 sm:justify-center">
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            Subscribe to {monitorName}
          </DialogTitle>
          <DialogDescription className="text-center">
            Get notified when this component is affected by incidents or
            maintenance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Notify me about:</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="notify-incident"
                  checked={notifyOnIncident}
                  onCheckedChange={(checked) =>
                    setNotifyOnIncident(checked === true)
                  }
                  disabled={isLoading}
                />
                <Label
                  htmlFor="notify-incident"
                  className="text-sm font-normal cursor-pointer"
                >
                  New incidents
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="notify-maintenance"
                  checked={notifyOnMaintenance}
                  onCheckedChange={(checked) =>
                    setNotifyOnMaintenance(checked === true)
                  }
                  disabled={isLoading}
                />
                <Label
                  htmlFor="notify-maintenance"
                  className="text-sm font-normal cursor-pointer"
                >
                  Scheduled maintenance
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="notify-status"
                  checked={notifyOnStatusChange}
                  onCheckedChange={(checked) =>
                    setNotifyOnStatusChange(checked === true)
                  }
                  disabled={isLoading}
                />
                <Label
                  htmlFor="notify-status"
                  className="text-sm font-normal cursor-pointer"
                >
                  Status changes (up/degraded/down)
                </Label>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-status-error-text">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading ||
                !email ||
                (!notifyOnIncident && !notifyOnMaintenance && !notifyOnStatusChange)
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Subscribing...
                </>
              ) : (
                "Subscribe"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

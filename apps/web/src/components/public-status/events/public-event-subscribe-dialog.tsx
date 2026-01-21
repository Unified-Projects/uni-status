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
} from "@uni-status/ui";
import { Bell, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import type { UnifiedEvent } from "@uni-status/shared";

interface PublicEventSubscribeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: UnifiedEvent;
  slug: string;
}

// Always use relative URL for public status page API calls to avoid CORS issues on custom domains
const API_URL = "/api";

export function PublicEventSubscribeDialog({
  open,
  onOpenChange,
  event,
  slug,
}: PublicEventSubscribeDialogProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/public/status-pages/${slug}/events/${event.type}/${event.id}/subscribe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ email }),
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
              <DialogTitle className="text-center">Subscribed!</DialogTitle>
              <DialogDescription className="text-center">
                You will receive email notifications when this{" "}
                {event.type === "incident" ? "incident" : "maintenance window"} is
                updated or resolved.
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
          <DialogTitle className="text-center">Subscribe to updates</DialogTitle>
          <DialogDescription className="text-center">
            Get notified when &quot;{event.title}&quot; is updated or resolved.
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
            <Button type="submit" disabled={isLoading || !email}>
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

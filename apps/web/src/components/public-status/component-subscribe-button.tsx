"use client";

import { useState } from "react";
import { Button } from "@uni-status/ui";
import { Bell } from "lucide-react";
import { ComponentSubscribeDialog } from "./component-subscribe-dialog";
import { cn } from "@uni-status/ui/lib/utils";

interface ComponentSubscribeButtonProps {
  monitorId: string;
  monitorName: string;
  slug: string;
  variant?: "icon" | "text" | "icon-text";
  size?: "sm" | "default";
  className?: string;
}

export function ComponentSubscribeButton({
  monitorId,
  monitorName,
  slug,
  variant = "icon",
  size = "sm",
  className,
}: ComponentSubscribeButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const buttonContent = () => {
    switch (variant) {
      case "icon":
        return <Bell className="h-4 w-4" />;
      case "text":
        return "Subscribe";
      case "icon-text":
        return (
          <>
            <Bell className="h-4 w-4 mr-1" />
            Subscribe
          </>
        );
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size={size === "sm" ? "sm" : "default"}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setDialogOpen(true);
        }}
        className={cn(
          "text-[var(--status-muted-text)] hover:text-[var(--status-text)]",
          variant === "icon" && "h-8 w-8 p-0",
          className
        )}
        title={`Subscribe to ${monitorName}`}
      >
        {buttonContent()}
      </Button>

      <ComponentSubscribeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        monitorId={monitorId}
        monitorName={monitorName}
        slug={slug}
      />
    </>
  );
}

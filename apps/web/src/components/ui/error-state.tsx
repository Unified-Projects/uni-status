"use client";

import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button, Card, CardContent } from "@uni-status/ui";
import { cn } from "@uni-status/ui";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: Error | { message: string } | string;
  onRetry?: () => void;
  className?: string;
  variant?: "card" | "inline" | "full";
}

export function ErrorState({
  title = "Something went wrong",
  message,
  error,
  onRetry,
  className,
  variant = "card",
}: ErrorStateProps) {
  const errorMessage = message || (
    typeof error === "string"
      ? error
      : error?.message || "An unexpected error occurred. Please try again."
  );

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-2 text-destructive", className)}>
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">{errorMessage}</span>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="h-auto p-1"
          >
            <RefreshCcw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  if (variant === "full") {
    return (
      <div className={cn("flex min-h-[400px] flex-col items-center justify-center", className)}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
          {errorMessage}
        </p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" className="mt-6">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("border-destructive/50", className)}>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
          {errorMessage}
        </p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" className="mt-6">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button, Card, CardContent } from "@uni-status/ui";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const ActionButton = action ? (
    <Button onClick={action.onClick}>
      {action.icon && <action.icon className="mr-2 h-4 w-4" />}
      {action.label}
    </Button>
  ) : null;

  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
          {description}
        </p>
        {action && (
          <div className="mt-6">
            {action.href ? (
              <Link href={action.href}>{ActionButton}</Link>
            ) : (
              ActionButton
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronDown } from "lucide-react";
import { cn, Badge, Popover, PopoverContent, PopoverTrigger } from "@uni-status/ui";

interface Dependency {
  id: string;
  description?: string | null;
}

interface ServiceDependenciesProps {
  upstream: Dependency[];
  downstream: Dependency[];
  className?: string;
}

export function ServiceDependencies({
  upstream,
  downstream,
  className,
}: ServiceDependenciesProps) {
  const hasUpstream = upstream.length > 0;
  const hasDownstream = downstream.length > 0;

  if (!hasUpstream && !hasDownstream) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {hasUpstream && (
        <Popover>
          <PopoverTrigger asChild>
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-[var(--status-muted)] gap-1 py-0.5"
            >
              <ArrowUpRight className="h-3 w-3 text-status-info-solid" />
              <span className="text-xs">
                {upstream.length} upstream
              </span>
              <ChevronDown className="h-3 w-3" />
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="text-xs font-medium text-[var(--status-muted-text)] mb-2">
              Depends on:
            </div>
            <div className="space-y-1">
              {upstream.map((dep) => (
                <div
                  key={dep.id}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-[var(--status-muted)]"
                >
                  <ArrowUpRight className="h-3 w-3 text-status-info-solid flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {dep.id}
                    </div>
                    {dep.description && (
                      <div className="text-xs text-[var(--status-muted-text)] truncate">
                        {dep.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {hasDownstream && (
        <Popover>
          <PopoverTrigger asChild>
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-[var(--status-muted)] gap-1 py-0.5"
            >
              <ArrowDownRight className="h-3 w-3 text-status-orange-solid" />
              <span className="text-xs">
                {downstream.length} downstream
              </span>
              <ChevronDown className="h-3 w-3" />
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="text-xs font-medium text-[var(--status-muted-text)] mb-2">
              Depended on by:
            </div>
            <div className="space-y-1">
              {downstream.map((dep) => (
                <div
                  key={dep.id}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-[var(--status-muted)]"
                >
                  <ArrowDownRight className="h-3 w-3 text-status-orange-solid flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {dep.id}
                    </div>
                    {dep.description && (
                      <div className="text-xs text-[var(--status-muted-text)] truncate">
                        {dep.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

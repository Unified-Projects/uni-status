"use client";

import { cn, Card, CardContent } from "@uni-status/ui";
import { Check, List, LayoutGrid, PanelLeft, ScrollText } from "lucide-react";
import {
  STATUS_PAGE_TEMPLATES,
  type StatusPageTemplate,
  type LayoutType,
} from "@uni-status/shared";

interface TemplateSelectorProps {
  selectedTemplateId?: string;
  onSelect: (template: StatusPageTemplate) => void;
  className?: string;
}

const layoutIcons: Record<LayoutType, typeof List> = {
  list: List,
  cards: LayoutGrid,
  sidebar: PanelLeft,
  "single-page": ScrollText,
};

const layoutLabels: Record<LayoutType, string> = {
  list: "List",
  cards: "Cards",
  sidebar: "Sidebar",
  "single-page": "Single Page",
};

export function TemplateSelector({
  selectedTemplateId,
  onSelect,
  className,
}: TemplateSelectorProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {STATUS_PAGE_TEMPLATES.map((template) => {
        const isSelected = selectedTemplateId === template.id;
        const LayoutIcon = layoutIcons[template.config.layout];

        return (
          <Card
            key={template.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              isSelected && "ring-2 ring-primary"
            )}
            onClick={() => onSelect(template)}
          >
            {/* Template Preview */}
            <div className="h-28 rounded-t-lg bg-muted/50 relative overflow-hidden p-4">
              {/* Mini layout preview */}
              <div className="h-full flex flex-col gap-2">
                {/* Header preview */}
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary/40" />
                  <div className="h-2 w-16 rounded bg-muted-foreground/20" />
                </div>

                {/* Content preview based on layout */}
                <div className="flex-1 flex gap-2">
                  {template.config.layout === "sidebar" && (
                    <>
                      <div className="w-1/4 rounded bg-muted-foreground/10 p-1">
                        <div className="space-y-1">
                          <div className="h-1.5 w-full rounded bg-muted-foreground/20" />
                          <div className="h-1.5 w-3/4 rounded bg-muted-foreground/20" />
                          <div className="h-1.5 w-2/3 rounded bg-muted-foreground/20" />
                        </div>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="h-4 rounded bg-muted-foreground/10"
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {template.config.layout === "cards" && (
                    <div className="grid grid-cols-3 gap-1 w-full">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                          key={i}
                          className="rounded bg-muted-foreground/10 aspect-[4/3]"
                        />
                      ))}
                    </div>
                  )}

                  {template.config.layout === "list" && (
                    <div className="flex-1 space-y-1.5">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-4 rounded bg-muted-foreground/10 flex items-center gap-1 px-1"
                        >
                          <div className="h-2 w-2 rounded-full bg-green-400/60" />
                          <div className="h-1.5 flex-1 rounded bg-muted-foreground/20" />
                        </div>
                      ))}
                    </div>
                  )}

                  {template.config.layout === "single-page" && (
                    <div className="flex-1 space-y-2">
                      <div className="h-2 w-1/2 mx-auto rounded bg-muted-foreground/20" />
                      <div className="grid grid-cols-2 gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="h-5 rounded bg-muted-foreground/10"
                          />
                        ))}
                      </div>
                      <div className="h-px bg-muted-foreground/20" />
                      <div className="space-y-1">
                        <div className="h-3 rounded bg-muted-foreground/10" />
                        <div className="h-3 rounded bg-muted-foreground/10" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 h-6 w-6 bg-primary rounded-full flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>

            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{template.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {template.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <LayoutIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {layoutLabels[template.config.layout]} layout
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

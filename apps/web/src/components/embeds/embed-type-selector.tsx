"use client";

import { Badge as BadgeIcon, Circle, CreditCard, Code } from "lucide-react";
import { Card, cn } from "@uni-status/ui";

export type EmbedType = "badge" | "dot" | "card" | "widget";

interface EmbedTypeSelectorProps {
  value: EmbedType;
  onChange: (type: EmbedType) => void;
}

const embedTypes: Array<{
  type: EmbedType;
  label: string;
  description: string;
  icon: typeof BadgeIcon;
}> = [
  {
    type: "badge",
    label: "Badge",
    description: "shields.io-style SVG badge",
    icon: BadgeIcon,
  },
  {
    type: "dot",
    label: "Status Dot",
    description: "Minimal colored indicator",
    icon: Circle,
  },
  {
    type: "card",
    label: "Status Card",
    description: "Detailed status card",
    icon: CreditCard,
  },
  {
    type: "widget",
    label: "JS Widget",
    description: "Self-updating widget",
    icon: Code,
  },
];

export function EmbedTypeSelector({ value, onChange }: EmbedTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {embedTypes.map((embedType) => {
        const Icon = embedType.icon;
        const isSelected = value === embedType.type;

        return (
          <Card
            key={embedType.type}
            className={cn(
              "p-4 cursor-pointer transition-all hover:border-primary/50",
              isSelected && "border-primary ring-1 ring-primary"
            )}
            onClick={() => onChange(embedType.type)}
          >
            <div className="flex flex-col items-center text-center gap-2">
              <div
                className={cn(
                  "p-2 rounded-lg",
                  isSelected
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-sm">{embedType.label}</p>
                <p className="text-xs text-muted-foreground">
                  {embedType.description}
                </p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

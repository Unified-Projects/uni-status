"use client";

import type { IndicatorStyle } from "@uni-status/shared";
import { DotIndicator } from "./dot-indicator";
import { BadgeIndicator } from "./badge-indicator";
import { PillIndicator } from "./pill-indicator";
import { BarIndicator } from "./bar-indicator";
import type { IndicatorProps } from "./types";

interface StatusIndicatorWrapperProps extends IndicatorProps {
  style: IndicatorStyle;
}

export function StatusIndicatorWrapper({
  style,
  ...props
}: StatusIndicatorWrapperProps) {
  switch (style) {
    case "badge":
      return <BadgeIndicator {...props} />;
    case "pill":
      return <PillIndicator {...props} />;
    case "bar":
      return <BarIndicator {...props} />;
    case "dot":
    default:
      return <DotIndicator {...props} />;
  }
}

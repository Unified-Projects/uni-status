"use client";

import type { MonitorStyle, IndicatorStyle } from "@uni-status/shared";
import { MinimalMonitor } from "./minimal-monitor";
import { DetailedMonitor } from "./detailed-monitor";
import { CardMonitor } from "./card-monitor";
import { RowMonitor } from "./row-monitor";
import type { MonitorProps, CrowdsourcedProps, SubscriptionProps, GraphTooltipMetrics } from "./types";

interface MonitorWrapperProps extends Omit<MonitorProps, "indicatorStyle"> {
  style: MonitorStyle;
  indicatorStyle: IndicatorStyle;
  crowdsourced?: CrowdsourcedProps;
  subscription?: SubscriptionProps;
  displayMode?: "bars" | "graph" | "both";
  graphTooltipMetrics?: GraphTooltipMetrics;
}

export function MonitorWrapper({ style, crowdsourced, subscription, displayMode, graphTooltipMetrics, ...props }: MonitorWrapperProps) {
  switch (style) {
    case "minimal":
      return <MinimalMonitor {...props} crowdsourced={crowdsourced} subscription={subscription} displayMode={displayMode} graphTooltipMetrics={graphTooltipMetrics} />;
    case "detailed":
      return <DetailedMonitor {...props} crowdsourced={crowdsourced} subscription={subscription} displayMode={displayMode} graphTooltipMetrics={graphTooltipMetrics} />;
    case "card":
      return <CardMonitor {...props} crowdsourced={crowdsourced} subscription={subscription} displayMode={displayMode} graphTooltipMetrics={graphTooltipMetrics} />;
    case "row":
    default:
      return <RowMonitor {...props} crowdsourced={crowdsourced} subscription={subscription} displayMode={displayMode} graphTooltipMetrics={graphTooltipMetrics} />;
  }
}

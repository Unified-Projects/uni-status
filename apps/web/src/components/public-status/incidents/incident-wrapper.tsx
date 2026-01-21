"use client";

import type { IncidentStyle } from "@uni-status/shared";
import { TimelineIncident } from "./timeline-incident";
import { CardIncident } from "./card-incident";
import { CompactIncident } from "./compact-incident";
import { ExpandedIncident } from "./expanded-incident";
import type { IncidentProps } from "./types";

interface IncidentWrapperProps extends IncidentProps {
  style: IncidentStyle;
}

export function IncidentWrapper({ style, ...props }: IncidentWrapperProps) {
  switch (style) {
    case "cards":
      return <CardIncident {...props} />;
    case "compact":
      return <CompactIncident {...props} />;
    case "expanded":
      return <ExpandedIncident {...props} />;
    case "timeline":
    default:
      return <TimelineIncident {...props} />;
  }
}

"use client";

import { Network, Globe, Clock, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@uni-status/ui";

export interface TracerouteHop {
  hop: number;
  address: string | null;
  hostname: string | null;
  rtt: number | null;
}

export interface TracerouteHopsCardProps {
  hops: TracerouteHop[];
  target?: string;
  className?: string;
}

export function TracerouteHopsCard({ hops, target, className }: TracerouteHopsCardProps) {
  if (!hops || hops.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Network Path
          </CardTitle>
          <CardDescription>
            No traceroute data available yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Traceroute results will appear here after the first check.
          </div>
        </CardContent>
      </Card>
    );
  }

  const successfulHops = hops.filter((h) => h.address !== null);
  const timeoutHops = hops.filter((h) => h.address === null);
  const lastHop = hops[hops.length - 1];
  const reachedDestination = lastHop?.address !== null;

  const validRtts = hops
    .filter((h) => h.rtt !== null)
    .map((h) => h.rtt as number);
  const avgRtt = validRtts.length > 0
    ? Math.round(validRtts.reduce((a, b) => a + b, 0) / validRtts.length)
    : null;
  const maxRtt = validRtts.length > 0 ? Math.max(...validRtts) : null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5" />
          Network Path
        </CardTitle>
        <CardDescription>
          {target ? `Route to ${target}` : "Traceroute hop-by-hop analysis"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b">
          <div className="text-center">
            <div className="text-2xl font-bold">{hops.length}</div>
            <div className="text-xs text-muted-foreground">Total Hops</div>
          </div>
          <div className="text-center">
            <div className={cn(
              "text-2xl font-bold",
              reachedDestination ? "text-green-500" : "text-red-500"
            )}>
              {reachedDestination ? "Yes" : "No"}
            </div>
            <div className="text-xs text-muted-foreground">Destination Reached</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {avgRtt !== null ? `${avgRtt}ms` : "--"}
            </div>
            <div className="text-xs text-muted-foreground">Avg RTT</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {maxRtt !== null ? `${maxRtt}ms` : "--"}
            </div>
            <div className="text-xs text-muted-foreground">Max RTT</div>
          </div>
        </div>

        {/* Hops Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium w-12">#</th>
                <th className="pb-2 pr-4 font-medium">Host</th>
                <th className="pb-2 pr-4 font-medium">IP Address</th>
                <th className="pb-2 font-medium text-right">RTT</th>
              </tr>
            </thead>
            <tbody>
              {hops.map((hop) => (
                <tr
                  key={hop.hop}
                  className={cn(
                    "border-b last:border-0",
                    hop.address === null && "text-muted-foreground bg-muted/30"
                  )}
                >
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      {hop.address !== null ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-mono">{hop.hop}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    {hop.hostname ? (
                      <span className="font-medium">{hop.hostname}</span>
                    ) : hop.address ? (
                      <span className="text-muted-foreground italic">No hostname</span>
                    ) : (
                      <span className="text-muted-foreground italic">* * *</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {hop.address || "--"}
                  </td>
                  <td className={cn(
                    "py-2 text-right font-mono",
                    hop.rtt !== null && hop.rtt > 100 && "text-yellow-500",
                    hop.rtt !== null && hop.rtt > 200 && "text-red-500"
                  )}>
                    {hop.rtt !== null ? `${hop.rtt}ms` : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Status Summary */}
        <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              {successfulHops.length} successful
            </span>
            {timeoutHops.length > 0 && (
              <span className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                {timeoutHops.length} timeout{timeoutHops.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {lastHop && lastHop.address && (
            <span className="flex items-center gap-1">
              <Globe className="h-4 w-4" />
              Final: {lastHop.address}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Compact summary component for stats row
export interface TracerouteStatsProps {
  hops: TracerouteHop[];
}

export function TracerouteStats({ hops }: TracerouteStatsProps) {
  if (!hops || hops.length === 0) {
    return <span className="text-muted-foreground">--</span>;
  }

  const lastHop = hops[hops.length - 1];
  const reachedDestination = lastHop?.address !== null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-bold">{hops.length}</span>
      <span className={cn(
        "text-xs",
        reachedDestination ? "text-green-500" : "text-yellow-500"
      )}>
        hops
        {!reachedDestination && " (incomplete)"}
      </span>
    </div>
  );
}

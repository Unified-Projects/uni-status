"use client";

import { useState } from "react";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  cn,
} from "@uni-status/ui";
import { useExportAuditLogs } from "@/hooks/use-audit-logs";

export interface AuditExportDialogProps {
  trigger?: React.ReactNode;
  className?: string;
}

export function AuditExportDialog({ trigger, className }: AuditExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"json" | "csv">("csv");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { getExportUrl } = useExportAuditLogs();

  const handleExport = () => {
    const url = getExportUrl(format, {
      from: from ? `${from}T00:00:00Z` : undefined,
      to: to ? `${to}T23:59:59Z` : undefined,
    });

    // Open download in new tab
    window.open(url, "_blank");
    setOpen(false);
  };

  // Default trigger
  const defaultTrigger = (
    <Button variant="outline" size="sm">
      <Download className="h-4 w-4 mr-2" />
      Export
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild className={className}>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Audit Logs</DialogTitle>
          <DialogDescription>
            Download audit logs in your preferred format. Exports up to 10,000
            records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat("csv")}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 border rounded-lg transition-colors",
                  format === "csv"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:bg-muted/50"
                )}
              >
                <FileSpreadsheet
                  className={cn(
                    "h-8 w-8",
                    format === "csv" ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <div className="text-sm font-medium">CSV</div>
                <div className="text-xs text-muted-foreground text-center">
                  Best for spreadsheets
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormat("json")}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 border rounded-lg transition-colors",
                  format === "json"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:bg-muted/50"
                )}
              >
                <FileJson
                  className={cn(
                    "h-8 w-8",
                    format === "json" ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <div className="text-sm font-medium">JSON</div>
                <div className="text-xs text-muted-foreground text-center">
                  Best for developers
                </div>
              </button>
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-3">
            <Label>Date Range (Optional)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty to export all available logs
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Download {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Job } from "bullmq";
import { db } from "@uni-status/database";
import { checkResults, crowdsourcedReports } from "@uni-status/database/schema";
import { lt } from "drizzle-orm";
import { DATA_RETENTION } from "@uni-status/shared/constants";

interface CleanupJob {
  type: "check_results" | "audit_logs" | "crowdsourced_reports" | "all";
}

export async function processCleanup(job: Job<CleanupJob>) {
  const { type } = job.data;

  console.log(`Running cleanup job: ${type}`);

  const results = {
    checkResults: 0,
    auditLogs: 0,
    crowdsourcedReports: 0,
  };

  // Cleanup check results
  if (type === "check_results" || type === "all") {
    const retentionDays = DATA_RETENTION.CHECK_RESULTS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleted = await db
      .delete(checkResults)
      .where(lt(checkResults.createdAt, cutoffDate))
      .returning();

    results.checkResults = deleted.length;
    console.log(`Deleted ${deleted.length} check results older than ${retentionDays} days`);
  }

  // Cleanup audit logs - handled by enterprise package
  if (type === "audit_logs" || type === "all") {
    try {
      const { auditLogs } = await import("@uni-status/enterprise/database/schema");
      const retentionDays = DATA_RETENTION.AUDIT_LOGS;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await db
        .delete(auditLogs)
        .where(lt(auditLogs.createdAt, cutoffDate))
        .returning();

      results.auditLogs = deleted.length;
      console.log(`Deleted ${deleted.length} audit logs older than ${retentionDays} days`);
    } catch {
      console.log("Audit logs cleanup skipped - enterprise package not available");
    }
  }

  // Cleanup expired crowdsourced reports (these expire based on expiresAt, not a fixed retention)
  if (type === "crowdsourced_reports" || type === "all") {
    const now = new Date();

    const deleted = await db
      .delete(crowdsourcedReports)
      .where(lt(crowdsourcedReports.expiresAt, now))
      .returning();

    results.crowdsourcedReports = deleted.length;
    console.log(`Deleted ${deleted.length} expired crowdsourced reports`);
  }

  console.log("Cleanup completed:", results);

  return results;
}

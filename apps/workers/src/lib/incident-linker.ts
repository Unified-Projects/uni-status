import { db } from "@uni-status/database";
import { checkResults, incidents } from "@uni-status/database/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import type { CheckStatus } from "@uni-status/shared/types";

/**
 * Links a failed check result to any active incident affecting the monitor.
 * This is called automatically after each check result is stored.
 *
 * @param checkResultId - The ID of the check result to potentially link
 * @param monitorId - The monitor that was checked
 * @param status - The status of the check result
 * @returns The incident ID if linked, null otherwise
 */
export async function linkCheckToActiveIncident(
  checkResultId: string,
  monitorId: string,
  status: CheckStatus
): Promise<string | null> {
  // Only link non-success statuses
  if (status === "success") {
    return null;
  }

  try {
    // Find an active (non-resolved) incident that affects this monitor
    const activeIncident = await db.query.incidents.findFirst({
      where: and(
        ne(incidents.status, "resolved"),
        // Check if monitorId is in the affectedMonitors JSONB array
        sql`${incidents.affectedMonitors}::jsonb @> ${JSON.stringify([monitorId])}::jsonb`
      ),
      orderBy: (incidents, { desc }) => [desc(incidents.startedAt)],
    });

    if (activeIncident) {
      // Update the check result to link it to the incident
      await db
        .update(checkResults)
        .set({ incidentId: activeIncident.id })
        .where(eq(checkResults.id, checkResultId));

      return activeIncident.id;
    }
  } catch (error) {
    // Log but don't fail the check if incident linking fails
    console.error(
      `Failed to link check result ${checkResultId} to incident:`,
      error
    );
  }

  return null;
}

import { Client } from "pg";
import { resetDatabase } from "../helpers/context";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

/**
 * Sync enum values that may be missing from the database.
 * drizzle-kit push doesn't add new enum values to existing types.
 */
async function syncEnumValues(client: Client) {
  // audit_action enum values
  const auditActions = [
    "incident.document.add",
    "incident.document.delete",
    "incident.document.update",
    "deployment.create",
    "deployment.link_incident",
    "deployment.unlink_incident",
    "deployment_webhook.create",
    "deployment_webhook.delete",
    "deployment_webhook.regenerate_secret",
    "event_subscription.create",
    "event_subscription.delete",
    "external_status.create",
    "external_status.update",
    "external_status.delete",
    "external_status.toggle",
    "probe.create",
    "probe.update",
    "probe.delete",
    "probe.regenerate_token",
    "probe.assign_monitor",
    "probe.unassign_monitor",
    "report.generate",
    "report_settings.create",
    "report_settings.update",
    "report_settings.delete",
    "report_template.create",
    "report_template.update",
    "report_template.delete",
    "role.create",
    "role.update",
    "role.delete",
    "slo.create",
    "slo.update",
    "slo.delete",
  ];

  // resource_type enum values
  const resourceTypes = [
    "incident_document",
    "deployment_event",
    "deployment_incident",
    "deployment_webhook",
    "external_status_provider",
    "probe",
    "probe_assignment",
    "sla_report",
    "report_settings",
    "report_template",
    "role",
    "slo_target",
  ];

  for (const value of auditActions) {
    try {
      await client.query(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '${value}'`);
    } catch {
      // Ignore errors (value may already exist)
    }
  }

  for (const value of resourceTypes) {
    try {
      await client.query(`ALTER TYPE resource_type ADD VALUE IF NOT EXISTS '${value}'`);
    } catch {
      // Ignore errors (value may already exist)
    }
  }

  console.log("[setup] Enum values synced");
}

export default async function () {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });

  await client.connect();
  try {
    console.log("[setup] Syncing enum values...");
    await syncEnumValues(client);
    console.log("[setup] Resetting database for test run...");
    await resetDatabase(client);
  } finally {
    await client.end();
  }
}

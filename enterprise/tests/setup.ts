/**
 * Enterprise Tests Setup
 *
 * Setup file for enterprise-specific tests including:
 * - License management tests
 * - Keygen.sh integration tests
 * - Entitlement enforcement tests
 *
 * This setup file configures the test environment for
 * license-related functionality testing.
 */

import { Client } from "pg";
import { beforeAll, afterAll, afterEach } from "vitest";

const DEFAULT_DB_URL =
  "postgresql://uni_status:uni_status_dev@postgres:5432/uni_status?sslmode=disable";

// Environment configuration for license testing
const TEST_ENV = {
  // Use test database
  DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DB_URL,

  // Test Keygen.sh configuration
  UNI_STATUS_KEYGEN_API_URL:
    process.env.UNI_STATUS_KEYGEN_API_URL ?? "http://keygen:3000/v1",
  UNI_STATUS_KEYGEN_ACCOUNT_ID:
    process.env.UNI_STATUS_KEYGEN_ACCOUNT_ID ?? "test-account",
  UNI_STATUS_KEYGEN_WEBHOOK_SECRET:
    process.env.UNI_STATUS_KEYGEN_WEBHOOK_SECRET ?? "test-webhook-secret",
  UNI_STATUS_KEYGEN_PUBLIC_KEY:
    process.env.UNI_STATUS_KEYGEN_PUBLIC_KEY ?? "",
  // Force hosted mode for entitlement enforcement tests
  DEPLOYMENT_TYPE: process.env.DEPLOYMENT_TYPE ?? "HOSTED",
};

// Apply test environment
Object.entries(TEST_ENV).forEach(([key, value]) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
});

/**
 * Sync license-related enum values that may be missing from the database.
 * drizzle-kit push doesn't add new enum values to existing types.
 */
async function syncLicenseEnumValues(client: Client): Promise<void> {
  // License status enum values
  const licenseStatuses = ["active", "expired", "suspended", "revoked"];

  // Grace period status enum values
  const gracePeriodStatuses = ["none", "active", "expired"];

  // Plan enum values
  const planValues = ["free", "pro", "enterprise"];

  // Billing event type enum values
  const billingEventTypes = [
    "license_created",
    "license_activated",
    "license_renewed",
    "license_expired",
    "license_suspended",
    "license_revoked",
    "license_reinstated",
    "grace_period_started",
    "grace_period_reminder",
    "grace_period_ended",
    "downgraded",
    "downgrade_notification_sent",
    "entitlements_synced",
    "payment_succeeded",
    "payment_failed",
    "subscription_created",
    "subscription_updated",
    "subscription_cancelled",
  ];

  // Validation type enum values
  const validationTypes = ["online", "offline", "startup", "scheduled"];

  // Create enum if not exists and add values
  const enumUpdates = [
    { type: "license_status", values: licenseStatuses },
    { type: "grace_period_status", values: gracePeriodStatuses },
    { type: "license_plan", values: planValues },
    { type: "billing_event_type", values: billingEventTypes },
    { type: "validation_type", values: validationTypes },
  ];

  for (const { type, values } of enumUpdates) {
    for (const value of values) {
      try {
        await client.query(
          `ALTER TYPE ${type} ADD VALUE IF NOT EXISTS '${value}'`
        );
      } catch {
        // Ignore errors (type may not exist or value may already exist)
      }
    }
  }
}

/**
 * Clean up license test data.
 * Removes test licenses and related records while preserving core data.
 */
async function cleanupLicenseTestData(client: Client): Promise<void> {
  try {
    // Delete in order respecting foreign key constraints
    await client.query("BEGIN");

    // Delete license validations first
    await client.query(
      `DELETE FROM license_validations
       WHERE license_id IN (
         SELECT id FROM licenses WHERE organization_id LIKE 'test_%'
       )`
    );

    // Delete billing events
    await client.query(
      `DELETE FROM billing_events
       WHERE organization_id LIKE 'test_%'`
    );

    // Delete licenses
    await client.query(`DELETE FROM licenses WHERE organization_id LIKE 'test_%'`);

    // Delete stripe customers
    await client.query(
      `DELETE FROM stripe_customers WHERE organization_id LIKE 'test_%'`
    );

    // Delete invoices
    await client.query(
      `DELETE FROM invoices WHERE organization_id LIKE 'test_%'`
    );

    await client.query("COMMIT");
    console.log("[enterprise-setup] License test data cleaned up");
  } catch (error) {
    await client.query("ROLLBACK");
    console.warn("[enterprise-setup] Cleanup warning:", error);
  }
}

// Export setup functions for use in individual test files
export { syncLicenseEnumValues, cleanupLicenseTestData };

// Global setup for enterprise tests
let globalClient: Client | null = null;

beforeAll(async () => {
  globalClient = new Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
  });
  await globalClient.connect();

  console.log("[enterprise-setup] Syncing license enum values...");
  await syncLicenseEnumValues(globalClient);
});

afterAll(async () => {
  if (globalClient) {
    await globalClient.end();
    globalClient = null;
  }
  console.log("[enterprise-setup] Enterprise test teardown complete");
});

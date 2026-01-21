import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@uni-status/database";
import { probes } from "@uni-status/database/schema";
import { eq, isNotNull, sql } from "drizzle-orm";

export const regionsRoutes = new OpenAPIHono();

// Get available regions from active probes
// This is a public endpoint - no auth required
regionsRoutes.get("/", async (c) => {
  try {
    // Get distinct regions from active probes
    const activeRegions = await db
      .selectDistinct({ region: probes.region })
      .from(probes)
      .where(
        sql`${probes.status} = 'active' AND ${probes.region} IS NOT NULL AND ${probes.region} != ''`
      )
      .orderBy(probes.region);

    const regions = activeRegions
      .map((r) => r.region)
      .filter((r): r is string => r !== null);

    // Determine default region - prefer UK if available, otherwise first available
    const defaultRegion = regions.includes("uk")
      ? "uk"
      : regions[0] || "uk";

    return c.json({
      success: true,
      data: {
        regions,
        default: defaultRegion,
        // Include count of active probes per region for UI display
        isEmpty: regions.length === 0,
      },
    });
  } catch (error) {
    console.error("Failed to fetch regions:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch available regions",
      },
      500
    );
  }
});

// Get detailed region info with probe counts
regionsRoutes.get("/detailed", async (c) => {
  try {
    // Get region counts from active probes
    const regionCounts = await db
      .select({
        region: probes.region,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(probes)
      .where(
        sql`${probes.status} = 'active' AND ${probes.region} IS NOT NULL AND ${probes.region} != ''`
      )
      .groupBy(probes.region)
      .orderBy(probes.region);

    const regions = regionCounts
      .filter((r) => r.region !== null)
      .map((r) => ({
        id: r.region as string,
        name: formatRegionName(r.region as string),
        probeCount: r.count,
      }));

    // Determine default region - prefer UK if available
    const defaultRegion = regions.find((r) => r.id === "uk")?.id
      || regions[0]?.id
      || "uk";

    return c.json({
      success: true,
      data: {
        regions,
        default: defaultRegion,
        totalProbes: regionCounts.reduce((sum, r) => sum + r.count, 0),
      },
    });
  } catch (error) {
    console.error("Failed to fetch detailed regions:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch region details",
      },
      500
    );
  }
});

// Helper to format region IDs into human-readable names
function formatRegionName(regionId: string): string {
  const regionNames: Record<string, string> = {
    uk: "United Kingdom",
    "eu-west": "EU West (Ireland)",
    "eu-central": "EU Central (Frankfurt)",
    "us-east": "US East (Virginia)",
    "us-west": "US West (California)",
    "ap-southeast": "Asia Pacific (Singapore)",
    "ap-northeast": "Asia Pacific (Tokyo)",
    "sa-east": "South America (Sao Paulo)",
    "au-southeast": "Australia (Sydney)",
  };

  return regionNames[regionId] || regionId.charAt(0).toUpperCase() + regionId.slice(1).replace(/-/g, " ");
}

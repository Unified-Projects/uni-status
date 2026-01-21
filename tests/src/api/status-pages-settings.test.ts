/**
 * Status Page Settings Tests
 *
 * Tests for status page settings persistence, particularly:
 * - displayMode (bars, graph, both)
 * - graphTooltipMetrics configuration
 * - Logo and favicon custom icons
 */

import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Status Page Settings", () => {
  let ctx: TestContext;
  let statusPageId: string;
  const statusPageSlug = `settings-test-${randomUUID().slice(0, 8).toLowerCase()}`;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create a test status page
    const response = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Settings Test Page",
        slug: statusPageSlug,
        published: false,
      }),
    });

    const body = await response.json();
    statusPageId = body.data.id;
  });

  describe("displayMode setting", () => {
    it("accepts displayMode 'bars' and persists it", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          settings: {
            displayMode: "bars",
          },
        }),
      });

      expect(response.status).toBe(200);

      // Fetch and verify
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        headers: ctx.headers,
      });
      const getBody = await getResponse.json();
      expect(getBody.data.settings.displayMode).toBe("bars");
    });

    it("accepts displayMode 'graph' and persists it", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          settings: {
            displayMode: "graph",
          },
        }),
      });

      expect(response.status).toBe(200);

      // Fetch and verify
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        headers: ctx.headers,
      });
      const getBody = await getResponse.json();
      expect(getBody.data.settings.displayMode).toBe("graph");
    });

    it("accepts displayMode 'both' and persists it", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          settings: {
            displayMode: "both",
          },
        }),
      });

      expect(response.status).toBe(200);

      // Fetch and verify
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        headers: ctx.headers,
      });
      const getBody = await getResponse.json();
      expect(getBody.data.settings.displayMode).toBe("both");
    });

    it("rejects invalid displayMode value", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          settings: {
            displayMode: "invalid",
          },
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("graphTooltipMetrics setting", () => {
    it("accepts and persists graphTooltipMetrics", async () => {
      const metricsConfig = {
        avg: true,
        min: true,
        max: true,
        p50: false,
        p90: true,
        p99: false,
      };

      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          settings: {
            graphTooltipMetrics: metricsConfig,
          },
        }),
      });

      expect(response.status).toBe(200);

      // Fetch and verify
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        headers: ctx.headers,
      });
      const getBody = await getResponse.json();
      expect(getBody.data.settings.graphTooltipMetrics).toMatchObject(metricsConfig);
    });

    it("accepts partial graphTooltipMetrics update", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          settings: {
            graphTooltipMetrics: {
              avg: true,
            },
          },
        }),
      });

      expect(response.status).toBe(200);

      // Fetch and verify
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        headers: ctx.headers,
      });
      const getBody = await getResponse.json();
      expect(getBody.data.settings.graphTooltipMetrics.avg).toBe(true);
    });
  });

  describe("displayMode and graphTooltipMetrics together", () => {
    it("persists both settings when updated together", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          settings: {
            displayMode: "both",
            graphTooltipMetrics: {
              avg: true,
              min: false,
              max: false,
              p50: true,
              p90: true,
              p99: true,
            },
          },
        }),
      });

      expect(response.status).toBe(200);

      // Fetch and verify both persisted
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        headers: ctx.headers,
      });
      const getBody = await getResponse.json();
      expect(getBody.data.settings.displayMode).toBe("both");
      expect(getBody.data.settings.graphTooltipMetrics.avg).toBe(true);
      expect(getBody.data.settings.graphTooltipMetrics.p99).toBe(true);
    });
  });

  describe("logo and favicon", () => {
    it("accepts logo URL and persists it", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          logo: "https://example.com/logo.png",
        }),
      });

      expect(response.status).toBe(200);

      // Fetch and verify
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        headers: ctx.headers,
      });
      const getBody = await getResponse.json();
      expect(getBody.data.logoUrl).toBe("https://example.com/logo.png");
    });

    it("accepts favicon URL and persists it", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          favicon: "https://example.com/favicon.ico",
        }),
      });

      expect(response.status).toBe(200);

      // Fetch and verify
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        headers: ctx.headers,
      });
      const getBody = await getResponse.json();
      expect(getBody.data.faviconUrl).toBe("https://example.com/favicon.ico");
    });

    it("clears logo when set to empty string", async () => {
      // First set a logo
      await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          logo: "https://example.com/logo.png",
        }),
      });

      // Then clear it
      const response = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          logo: "",
        }),
      });

      expect(response.status).toBe(200);

      // Fetch and verify it's cleared
      const getResponse = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
        headers: ctx.headers,
      });
      const getBody = await getResponse.json();
      expect(getBody.data.logoUrl).toBeFalsy();
    });
  });
});

/**
 * Badge Templates Tests
 *
 * Tests for badge template functionality:
 * - CRUD operations
 * - New metric types (p50, p90, p99, error_rate)
 * - Custom CSS configuration
 * - Scale configuration
 * - Validation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { randomUUID } from "crypto";

const API_URL = (process.env.API_BASE_URL ?? "http://api:3001") + "/api/v1";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await bootstrapTestContext();
});

describe("Badge Templates", () => {
  let templateId: string;

  describe("CRUD Operations", () => {
    it("creates a badge template", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Test Badge Template",
          description: "A test badge for automated testing",
          type: "badge",
          style: "modern",
          config: {
            label: "status",
            labelColor: "#4b5563",
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      templateId = data.id;

      expect(data.name).toBe("Test Badge Template");
      expect(data.type).toBe("badge");
      expect(data.style).toBe("modern");
    });

    it("lists badge templates", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it("gets a specific template", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates/${templateId}`, {
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.id).toBe(templateId);
      expect(data.name).toBe("Test Badge Template");
    });

    it("updates a badge template", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates/${templateId}`, {
        method: "PUT",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Updated Badge Template",
          config: {
            label: "status",
            scale: 1.5,
          },
        }),
      });

      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.name).toBe("Updated Badge Template");
      expect(data.config.scale).toBe(1.5);
    });

    it("deletes a badge template", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates/${templateId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.deleted).toBe(true);
    });
  });

  describe("New Metric Types", () => {
    it("accepts uptime metric type", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Uptime Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            customData: {
              enabled: true,
              type: "uptime",
              customLabel: "Uptime",
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.customData.type).toBe("uptime");
    });

    it("accepts response_time metric type", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Response Time Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            customData: {
              enabled: true,
              type: "response_time",
              customLabel: "Latency",
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.customData.type).toBe("response_time");
    });

    it("accepts p50 metric type", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `P50 Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            customData: {
              enabled: true,
              type: "p50",
              customLabel: "P50",
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.customData.type).toBe("p50");
    });

    it("accepts p90 metric type", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `P90 Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            customData: {
              enabled: true,
              type: "p90",
              customLabel: "P90",
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.customData.type).toBe("p90");
    });

    it("accepts p99 metric type", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `P99 Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            customData: {
              enabled: true,
              type: "p99",
              customLabel: "P99",
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.customData.type).toBe("p99");
    });

    it("accepts error_rate metric type", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Error Rate Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            customData: {
              enabled: true,
              type: "error_rate",
              customLabel: "Error Rate",
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.customData.type).toBe("error_rate");
    });

    it("accepts custom metric type with thresholds", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Custom Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            customData: {
              enabled: true,
              type: "custom",
              customLabel: "Custom Metric",
              customValue: "42",
              thresholds: [
                { value: 50, color: "#ef4444", comparison: "lt" },
                { value: 80, color: "#eab308", comparison: "lt" },
              ],
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.customData.type).toBe("custom");
      expect(data.config.customData.thresholds.length).toBe(2);
    });

    it("rejects invalid metric type", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Invalid Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            customData: {
              enabled: true,
              type: "invalid_type",
            },
          },
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("Custom CSS Configuration", () => {
    it("accepts customCss in config", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `CSS Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "modern",
          config: {
            customCss: "text { font-weight: bold; }",
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.customCss).toBe("text { font-weight: bold; }");
    });

    it("stores and retrieves custom CSS on update", async () => {
      // Create template without CSS
      const createResponse = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `CSS Update Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            label: "status",
          },
        }),
      });

      expect(createResponse.status).toBe(201);
      const { data: created } = await createResponse.json();

      // Update with CSS
      const updateResponse = await fetch(`${API_URL}/embeds/badge-templates/${created.id}`, {
        method: "PUT",
        headers: ctx.headers,
        body: JSON.stringify({
          config: {
            customCss: "rect { opacity: 0.9; }",
          },
        }),
      });

      expect(updateResponse.status).toBe(200);
      const { data: updated } = await updateResponse.json();
      expect(updated.config.customCss).toBe("rect { opacity: 0.9; }");
    });

    it("handles empty customCss gracefully", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Empty CSS Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            customCss: "",
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.customCss).toBe("");
    });
  });

  describe("Scale Configuration", () => {
    it("accepts scale value of 0.5", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Small Scale Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            scale: 0.5,
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.scale).toBe(0.5);
    });

    it("accepts scale value of 2", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Large Scale Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            scale: 2,
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.scale).toBe(2);
    });

    it("accepts scale value of 1.5", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Medium Scale Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "modern",
          config: {
            scale: 1.5,
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.scale).toBe(1.5);
    });

    it("defaults scale to undefined when not provided", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Default Scale Badge ${randomUUID().slice(0, 8)}`,
          type: "badge",
          style: "flat",
          config: {
            label: "status",
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      // Scale should not be set if not provided
      expect(data.config.scale).toBeUndefined();
    });
  });

  describe("Dot Animation Options", () => {
    it("accepts dot with pulse animation", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Pulse Dot ${randomUUID().slice(0, 8)}`,
          type: "dot",
          style: "modern",
          config: {
            dot: {
              size: 16,
              animate: true,
              animationStyle: "pulse",
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.type).toBe("dot");
      expect(data.config.dot.animate).toBe(true);
      expect(data.config.dot.animationStyle).toBe("pulse");
    });

    it("accepts dot with blink animation", async () => {
      const response = await fetch(`${API_URL}/embeds/badge-templates`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: `Blink Dot ${randomUUID().slice(0, 8)}`,
          type: "dot",
          style: "modern",
          config: {
            dot: {
              size: 12,
              animate: true,
              animationStyle: "blink",
            },
          },
        }),
      });

      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.config.dot.animationStyle).toBe("blink");
    });
  });
});

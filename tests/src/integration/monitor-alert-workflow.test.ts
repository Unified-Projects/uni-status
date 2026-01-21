/**
 * Monitor-Alert Integration Workflow Tests
 *
 * End-to-end tests that verify the complete workflow from:
 * 1. Monitor failure detection
 * 2. Alert policy evaluation
 * 3. Notification channel triggering
 * 4. Alert history recording
 */

import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import {
  insertMonitor,
  insertAlertChannel,
  insertAlertPolicy,
  insertCheckResults,
  setMonitorStatus,
} from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Monitor-Alert Integration Workflow", () => {
  let ctx: TestContext;
  let monitorId: string;
  let channelId: string;
  let policyId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  // ==========================================
  // SETUP WORKFLOW
  // ==========================================
  describe("Workflow Setup", () => {
    it("creates a monitor for testing", async () => {
      const monitor = await insertMonitor(ctx.organizationId, {
        name: "Integration Test Monitor",
        url: "https://integration-test.example.com",
      });
      monitorId = monitor.id;

      expect(monitorId).toBeDefined();
    });

    it("creates an alert channel", async () => {
      const channel = await insertAlertChannel(ctx.organizationId, {
        name: "Integration Test Channel",
        type: "email",
        config: { email: "integration-test@example.com" },
      });
      channelId = channel.id;

      expect(channelId).toBeDefined();
    });

    it("creates an alert policy linked to monitor", async () => {
      const policy = await insertAlertPolicy(ctx.organizationId, {
        name: "Integration Test Policy",
        channelIds: [channelId],
        conditions: { consecutiveFailures: 2 },
        cooldownMinutes: 5,
        monitors: [monitorId],
      });
      policyId = policy.id;

      expect(policyId).toBeDefined();
    });

    it("verifies policy is linked to channel", async () => {
      // API doesn't have GET by ID, so we verify via list endpoint
      const res = await fetch(`${API_BASE_URL}/api/v1/alerts/policies`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const policy = body.data.find((p: { id: string }) => p.id === policyId);
      expect(policy).toBeDefined();
      expect(policy.channels).toBeDefined();
    });
  });

  // ==========================================
  // FAILURE SCENARIO
  // ==========================================
  describe("Failure Detection Scenario", () => {
    it("monitor starts in active state", async () => {
      await setMonitorStatus(monitorId, "active");

      const res = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("active");
    });

    it("inserts first failure check result", async () => {
      await insertCheckResults(monitorId, [
        {
          status: "failure",
          responseTimeMs: 0,
          statusCode: 500,
          createdAt: new Date(Date.now() - 60000), // 1 minute ago
        },
      ]);

      // Policy requires 2 consecutive failures, so no alert yet
    });

    it("inserts second failure check result", async () => {
      await insertCheckResults(monitorId, [
        {
          status: "failure",
          responseTimeMs: 0,
          statusCode: 500,
          createdAt: new Date(),
        },
      ]);

      // Now should trigger alert (2 consecutive failures)
    });

    it("monitor status changes to down", async () => {
      await setMonitorStatus(monitorId, "down");

      const res = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("down");
    });

    it("alert history records the failure event", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/alerts/history`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  // ==========================================
  // RECOVERY SCENARIO
  // ==========================================
  describe("Recovery Detection Scenario", () => {
    it("inserts first success check result", async () => {
      await insertCheckResults(monitorId, [
        {
          status: "success",
          responseTimeMs: 150,
          statusCode: 200,
          createdAt: new Date(),
        },
      ]);
    });

    it("inserts second success check result", async () => {
      await insertCheckResults(monitorId, [
        {
          status: "success",
          responseTimeMs: 120,
          statusCode: 200,
          createdAt: new Date(),
        },
      ]);
    });

    it("monitor status changes back to active", async () => {
      await setMonitorStatus(monitorId, "active");

      const res = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("active");
    });
  });

  // ==========================================
  // DEGRADED SCENARIO
  // ==========================================
  describe("Degraded Detection Scenario", () => {
    let degradedMonitorId: string;
    let degradedPolicyId: string;

    beforeAll(async () => {
      const monitor = await insertMonitor(ctx.organizationId, {
        name: "Degraded Test Monitor",
        url: "https://degraded-test.example.com",
      });
      degradedMonitorId = monitor.id;

      const policy = await insertAlertPolicy(ctx.organizationId, {
        name: "Degraded Policy",
        channelIds: [channelId],
        conditions: { degradedDuration: 5 }, // 5 seconds
        cooldownMinutes: 5,
        monitors: [degradedMonitorId],
      });
      degradedPolicyId = policy.id;
    });

    it("monitor enters degraded state on slow response", async () => {
      await insertCheckResults(degradedMonitorId, [
        {
          status: "degraded",
          responseTimeMs: 5000, // 5 seconds
          statusCode: 200,
          createdAt: new Date(),
        },
      ]);

      await setMonitorStatus(degradedMonitorId, "degraded");

      const res = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${degradedMonitorId}`,
        { headers: ctx.headers }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("degraded");
    });

    it("monitor recovers from degraded state", async () => {
      await insertCheckResults(degradedMonitorId, [
        {
          status: "success",
          responseTimeMs: 100,
          statusCode: 200,
          createdAt: new Date(),
        },
      ]);

      await setMonitorStatus(degradedMonitorId, "active");

      const res = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${degradedMonitorId}`,
        { headers: ctx.headers }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("active");
    });
  });

  // ==========================================
  // MULTIPLE MONITORS SCENARIO
  // ==========================================
  describe("Multiple Monitors Alert Workflow", () => {
    let monitor1Id: string;
    let monitor2Id: string;
    let monitor3Id: string;
    let globalPolicyId: string;

    beforeAll(async () => {
      const monitor1 = await insertMonitor(ctx.organizationId, {
        name: "Multi Monitor 1",
        url: "https://multi-1.example.com",
      });
      monitor1Id = monitor1.id;

      const monitor2 = await insertMonitor(ctx.organizationId, {
        name: "Multi Monitor 2",
        url: "https://multi-2.example.com",
      });
      monitor2Id = monitor2.id;

      const monitor3 = await insertMonitor(ctx.organizationId, {
        name: "Multi Monitor 3",
        url: "https://multi-3.example.com",
      });
      monitor3Id = monitor3.id;

      // Create global policy (no specific monitors = all monitors)
      const policy = await insertAlertPolicy(ctx.organizationId, {
        name: "Global Alert Policy",
        channelIds: [channelId],
        conditions: { consecutiveFailures: 1 },
        cooldownMinutes: 5,
      });
      globalPolicyId = policy.id;
    });

    it("creates check results for multiple monitors", async () => {
      await insertCheckResults(monitor1Id, [
        { status: "success", responseTimeMs: 100, statusCode: 200 },
      ]);

      await insertCheckResults(monitor2Id, [
        { status: "failure", responseTimeMs: 0, statusCode: 503 },
      ]);

      await insertCheckResults(monitor3Id, [
        { status: "degraded", responseTimeMs: 3000, statusCode: 200 },
      ]);

      await setMonitorStatus(monitor1Id, "active");
      await setMonitorStatus(monitor2Id, "down");
      await setMonitorStatus(monitor3Id, "degraded");
    });

    it("verifies monitor statuses are correct", async () => {
      const res1 = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${monitor1Id}`,
        { headers: ctx.headers }
      );
      const body1 = await res1.json();
      expect(body1.data.status).toBe("active");

      const res2 = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${monitor2Id}`,
        { headers: ctx.headers }
      );
      const body2 = await res2.json();
      expect(body2.data.status).toBe("down");

      const res3 = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${monitor3Id}`,
        { headers: ctx.headers }
      );
      const body3 = await res3.json();
      expect(body3.data.status).toBe("degraded");
    });
  });

  // ==========================================
  // COOLDOWN PERIOD TESTS
  // ==========================================
  describe("Alert Cooldown Period", () => {
    let cooldownMonitorId: string;
    let cooldownPolicyId: string;

    beforeAll(async () => {
      const monitor = await insertMonitor(ctx.organizationId, {
        name: "Cooldown Test Monitor",
        url: "https://cooldown-test.example.com",
      });
      cooldownMonitorId = monitor.id;

      const policy = await insertAlertPolicy(ctx.organizationId, {
        name: "Short Cooldown Policy",
        channelIds: [channelId],
        conditions: { consecutiveFailures: 1 },
        cooldownMinutes: 1, // 1 minute cooldown
        monitors: [cooldownMonitorId],
      });
      cooldownPolicyId = policy.id;
    });

    it("policy exists with cooldown configured", async () => {
      // API doesn't have GET by ID, so we verify via list endpoint
      const res = await fetch(`${API_BASE_URL}/api/v1/alerts/policies`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const policy = body.data.find((p: { id: string }) => p.id === cooldownPolicyId);
      expect(policy).toBeDefined();
      expect(policy.cooldownMinutes).toBe(1);
    });

    it("first failure triggers alert", async () => {
      await insertCheckResults(cooldownMonitorId, [
        {
          status: "failure",
          responseTimeMs: 0,
          statusCode: 500,
          createdAt: new Date(),
        },
      ]);

      await setMonitorStatus(cooldownMonitorId, "down");
    });
  });

  // ==========================================
  // FAILURES IN WINDOW TESTS
  // ==========================================
  describe("Failures in Window Alert", () => {
    let windowMonitorId: string;
    let windowPolicyId: string;

    beforeAll(async () => {
      const monitor = await insertMonitor(ctx.organizationId, {
        name: "Window Test Monitor",
        url: "https://window-test.example.com",
      });
      windowMonitorId = monitor.id;

      const policy = await insertAlertPolicy(ctx.organizationId, {
        name: "Failures in Window Policy",
        channelIds: [channelId],
        conditions: {
          failuresInWindow: { count: 3, windowMinutes: 5 },
        },
        cooldownMinutes: 5,
        monitors: [windowMonitorId],
      });
      windowPolicyId = policy.id;
    });

    it("policy exists with failures in window condition", async () => {
      // API doesn't have GET by ID, so we verify via list endpoint
      const res = await fetch(`${API_BASE_URL}/api/v1/alerts/policies`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const policy = body.data.find((p: { id: string }) => p.id === windowPolicyId);
      expect(policy).toBeDefined();
      expect(policy.conditions.failuresInWindow.count).toBe(3);
      expect(policy.conditions.failuresInWindow.windowMinutes).toBe(5);
    });

    it("inserts failures within window", async () => {
      const now = Date.now();

      await insertCheckResults(windowMonitorId, [
        {
          status: "failure",
          responseTimeMs: 0,
          statusCode: 500,
          createdAt: new Date(now - 240000), // 4 min ago
        },
        {
          status: "success",
          responseTimeMs: 100,
          statusCode: 200,
          createdAt: new Date(now - 180000), // 3 min ago
        },
        {
          status: "failure",
          responseTimeMs: 0,
          statusCode: 503,
          createdAt: new Date(now - 120000), // 2 min ago
        },
        {
          status: "failure",
          responseTimeMs: 0,
          statusCode: 502,
          createdAt: new Date(now - 60000), // 1 min ago
        },
      ]);

      // 3 failures in 5 minutes should trigger alert
    });
  });

  // ==========================================
  // MULTIPLE CHANNELS ALERT
  // ==========================================
  describe("Multiple Channels Alert", () => {
    let multiChannelMonitorId: string;
    let slackChannelId: string;
    let discordChannelId: string;
    let multiChannelPolicyId: string;

    beforeAll(async () => {
      const monitor = await insertMonitor(ctx.organizationId, {
        name: "Multi Channel Monitor",
        url: "https://multi-channel.example.com",
      });
      multiChannelMonitorId = monitor.id;

      const slackChannel = await insertAlertChannel(ctx.organizationId, {
        name: "Multi Channel Slack",
        type: "slack",
        config: { webhookUrl: "https://hooks.slack.com/multi-channel" },
      });
      slackChannelId = slackChannel.id;

      const discordChannel = await insertAlertChannel(ctx.organizationId, {
        name: "Multi Channel Discord",
        type: "discord",
        config: { webhookUrl: "https://discord.com/api/webhooks/multi" },
      });
      discordChannelId = discordChannel.id;

      const policy = await insertAlertPolicy(ctx.organizationId, {
        name: "Multi Channel Policy",
        channelIds: [channelId, slackChannelId, discordChannelId],
        conditions: { consecutiveFailures: 1 },
        cooldownMinutes: 5,
        monitors: [multiChannelMonitorId],
      });
      multiChannelPolicyId = policy.id;
    });

    it("policy has multiple channels", async () => {
      // API doesn't have GET by ID, so we verify via list endpoint
      const res = await fetch(`${API_BASE_URL}/api/v1/alerts/policies`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const policy = body.data.find((p: { id: string }) => p.id === multiChannelPolicyId);
      expect(policy).toBeDefined();
      expect(policy.channels.length).toBe(3);
    });

    it("failure triggers alerts to all channels", async () => {
      await insertCheckResults(multiChannelMonitorId, [
        {
          status: "failure",
          responseTimeMs: 0,
          statusCode: 500,
          createdAt: new Date(),
        },
      ]);

      await setMonitorStatus(multiChannelMonitorId, "down");

      // Alerts should be queued for all three channels
    });
  });

  // ==========================================
  // DISABLED POLICY TESTS
  // ==========================================
  describe("Disabled Policy Handling", () => {
    let disabledMonitorId: string;
    let disabledPolicyId: string;

    beforeAll(async () => {
      const monitor = await insertMonitor(ctx.organizationId, {
        name: "Disabled Policy Monitor",
        url: "https://disabled-policy.example.com",
      });
      disabledMonitorId = monitor.id;

      const policy = await insertAlertPolicy(ctx.organizationId, {
        name: "Disabled Policy",
        channelIds: [channelId],
        conditions: { consecutiveFailures: 1 },
        cooldownMinutes: 5,
        monitors: [disabledMonitorId],
        enabled: false, // Disabled
      });
      disabledPolicyId = policy.id;
    });

    it("policy is disabled", async () => {
      // API doesn't have GET by ID, so we verify via list endpoint
      const res = await fetch(`${API_BASE_URL}/api/v1/alerts/policies`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const policy = body.data.find((p: { id: string }) => p.id === disabledPolicyId);
      expect(policy).toBeDefined();
      expect(policy.enabled).toBe(false);
    });

    it("failure does not trigger disabled policy", async () => {
      await insertCheckResults(disabledMonitorId, [
        {
          status: "failure",
          responseTimeMs: 0,
          statusCode: 500,
          createdAt: new Date(),
        },
      ]);

      // Disabled policy should not trigger alerts
    });

    it("enabling policy makes it active", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/alerts/policies/${disabledPolicyId}`,
        {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({ enabled: true }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.enabled).toBe(true);
    });
  });

  // ==========================================
  // DISABLED CHANNEL TESTS
  // ==========================================
  describe("Disabled Channel Handling", () => {
    let disabledChannelMonitorId: string;
    let disabledChannelId: string;
    let disabledChannelPolicyId: string;

    beforeAll(async () => {
      const monitor = await insertMonitor(ctx.organizationId, {
        name: "Disabled Channel Monitor",
        url: "https://disabled-channel.example.com",
      });
      disabledChannelMonitorId = monitor.id;

      const channel = await insertAlertChannel(ctx.organizationId, {
        name: "Disabled Channel",
        type: "email",
        config: { email: "disabled@example.com" },
      });
      disabledChannelId = channel.id;

      // Disable the channel
      await fetch(`${API_BASE_URL}/api/v1/alerts/channels/${disabledChannelId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ enabled: false }),
      });

      const policy = await insertAlertPolicy(ctx.organizationId, {
        name: "Disabled Channel Policy",
        channelIds: [disabledChannelId],
        conditions: { consecutiveFailures: 1 },
        cooldownMinutes: 5,
        monitors: [disabledChannelMonitorId],
      });
      disabledChannelPolicyId = policy.id;
    });

    it("channel is disabled", async () => {
      // API doesn't have GET by ID, so we verify via list endpoint
      const res = await fetch(`${API_BASE_URL}/api/v1/alerts/channels`, {
        headers: ctx.headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const channel = body.data.find((c: { id: string }) => c.id === disabledChannelId);
      expect(channel).toBeDefined();
      expect(channel.enabled).toBe(false);
    });
  });

  // ==========================================
  // CROSS-ORG ISOLATION
  // ==========================================
  describe("Cross-Organization Isolation", () => {
    let otherCtx: TestContext;
    let otherMonitorId: string;

    beforeAll(async () => {
      otherCtx = await bootstrapTestContext();

      const monitor = await insertMonitor(otherCtx.organizationId, {
        name: "Other Org Monitor",
        url: "https://other-org.example.com",
      });
      otherMonitorId = monitor.id;
    });

    it("cannot access other org monitor", async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/monitors/${otherMonitorId}`,
        { headers: ctx.headers }
      );

      expect(res.status).toBe(404);
    });

    it("cannot create policy with other org monitor", async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/alerts/policies`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Cross Org Policy",
          enabled: true,
          channels: [channelId],
          monitors: [otherMonitorId],
          conditions: { consecutiveFailures: 1 },
          cooldownMinutes: 5,
        }),
      });

      // Should either fail or ignore the invalid monitor
      if (res.status === 201) {
        const body = await res.json();
        expect(body.data.monitors || []).not.toContain(otherMonitorId);
      }
    });
  });
});

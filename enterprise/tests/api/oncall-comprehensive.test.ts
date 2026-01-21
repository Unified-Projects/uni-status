/**
 * On-Call Rotations Comprehensive Tests
 *
 * Tests On-Call API including:
 * - Rotation CRUD operations
 * - Override management
 * - Coverage gap detection
 * - Calendar view
 * - Handoff notifications
 * - Authorization and organization isolation
 */

import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { insertApiKey, insertOncallRotation, insertOncallOverride, insertOrganizationMember } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("On-Call API", () => {
  let ctx: TestContext;
  let participantUserId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Create an additional user to be a participant
    const member = await insertOrganizationMember(ctx.organizationId, {
      role: "member",
      email: `oncall-participant-${randomUUID().slice(0, 8)}@example.com`,
    });
    participantUserId = member.userId;
  });

  describe("Rotation CRUD Operations", () => {
    describe("Create Rotation", () => {
      it("creates rotation with all parameters", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Primary On-Call",
            description: "Primary support rotation",
            timezone: "America/New_York",
            rotationStart: new Date().toISOString(),
            shiftDurationMinutes: 480, // 8 hours
            participants: [ctx.userId, participantUserId],
            handoffNotificationMinutes: 30,
            handoffChannels: ["email"],
            active: true,
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBeDefined();
        expect(body.data.name).toBe("Primary On-Call");
        expect(body.data.timezone).toBe("America/New_York");
        expect(body.data.shiftDurationMinutes).toBe(480);
        expect(body.data.participants).toContain(ctx.userId);
      });

      it("creates rotation with minimal parameters", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Minimal Rotation",
            shiftDurationMinutes: 1440, // 24 hours
            participants: [ctx.userId],
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.timezone).toBe("UTC"); // Default
        expect(body.data.active).toBe(true); // Default
      });

      it("creates rotation with different shift durations", async () => {
        const durations = [60, 240, 480, 720, 1440]; // 1h, 4h, 8h, 12h, 24h

        for (const duration of durations) {
          const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
            method: "POST",
            headers: ctx.headers,
            body: JSON.stringify({
              name: `${duration}min Rotation`,
              shiftDurationMinutes: duration,
              participants: [ctx.userId],
            }),
          });

          expect(response.status).toBe(201);
          const body = await response.json();
          expect(body.data.shiftDurationMinutes).toBe(duration);
        }
      });

      it("creates rotation with multiple participants", async () => {
        // Create additional members
        const member2 = await insertOrganizationMember(ctx.organizationId, {
          role: "member",
          email: `oncall2-${randomUUID().slice(0, 8)}@example.com`,
        });
        const member3 = await insertOrganizationMember(ctx.organizationId, {
          role: "member",
          email: `oncall3-${randomUUID().slice(0, 8)}@example.com`,
        });

        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Multi-Person Rotation",
            shiftDurationMinutes: 480,
            participants: [ctx.userId, participantUserId, member2.userId, member3.userId],
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.data.participants.length).toBe(4);
      });
    });

    describe("List Rotations", () => {
      it("lists rotations with overrides", async () => {
        // Create a rotation first
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: `List Test Rotation ${randomUUID().slice(0, 8)}`,
            shiftDurationMinutes: 480,
            participants: [ctx.userId],
          }),
        });
        expect(createResponse.status).toBe(201);

        // List rotations
        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
      });

      it("includes override data in list response", async () => {
        // Create a rotation
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: `Override List Test ${randomUUID().slice(0, 8)}`,
            shiftDurationMinutes: 480,
            participants: [ctx.userId],
          }),
        });
        const rotationId = (await createResponse.json()).data.id;

        // Add an override
        await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            userId: participantUserId,
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 3600000).toISOString(),
            reason: "PTO",
          }),
        });

        // List and check for overrides
        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        const rotation = body.data.find((r: any) => r.id === rotationId);
        expect(rotation.overrides).toBeDefined();
        expect(Array.isArray(rotation.overrides)).toBe(true);
      });
    });

    describe("Update Rotation", () => {
      it("updates rotation name", async () => {
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Original Rotation Name",
            shiftDurationMinutes: 480,
            participants: [ctx.userId],
          }),
        });
        const rotationId = (await createResponse.json()).data.id;

        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Updated Rotation Name",
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.name).toBe("Updated Rotation Name");
      });

      it("updates rotation participants", async () => {
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Participants Update Test",
            shiftDurationMinutes: 480,
            participants: [ctx.userId],
          }),
        });
        const rotationId = (await createResponse.json()).data.id;

        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            participants: [ctx.userId, participantUserId],
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.participants.length).toBe(2);
      });

      it("updates shift duration", async () => {
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Duration Update Test",
            shiftDurationMinutes: 480,
            participants: [ctx.userId],
          }),
        });
        const rotationId = (await createResponse.json()).data.id;

        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            shiftDurationMinutes: 720,
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.shiftDurationMinutes).toBe(720);
      });

      it("toggles rotation active status", async () => {
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Active Toggle Test",
            shiftDurationMinutes: 480,
            participants: [ctx.userId],
            active: true,
          }),
        });
        const rotationId = (await createResponse.json()).data.id;

        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            active: false,
          }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.active).toBe(false);
      });

      it("returns 404 for non-existent rotation", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${randomUUID()}`, {
          method: "PATCH",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "Updated",
          }),
        });

        expect(response.status).toBe(404);
      });
    });

    describe("Delete Rotation", () => {
      it("deletes rotation and cascades overrides", async () => {
        // Create a rotation
        const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            name: "To Delete",
            shiftDurationMinutes: 480,
            participants: [ctx.userId],
          }),
        });
        const rotationId = (await createResponse.json()).data.id;

        // Add an override
        await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
          method: "POST",
          headers: ctx.headers,
          body: JSON.stringify({
            userId: ctx.userId,
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 3600000).toISOString(),
          }),
        });

        // Delete
        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}`, {
          method: "DELETE",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.deleted).toBe(true);
      });

      it("returns success for non-existent rotation (idempotent)", async () => {
        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${randomUUID()}`, {
          method: "DELETE",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.data.deleted).toBe(false);
      });
    });
  });

  describe("Override Management", () => {
    it("creates override for rotation", async () => {
      const createRotationResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Override Test Rotation",
          shiftDurationMinutes: 480,
          participants: [ctx.userId],
        }),
      });
      const rotationId = (await createRotationResponse.json()).data.id;

      const startAt = new Date();
      const endAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours later

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          userId: participantUserId,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          reason: "Vacation coverage",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.userId).toBe(participantUserId);
      expect(body.data.reason).toBe("Vacation coverage");
    });

    it("creates override without reason", async () => {
      const createRotationResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Override No Reason Test",
          shiftDurationMinutes: 480,
          participants: [ctx.userId],
        }),
      });
      const rotationId = (await createRotationResponse.json()).data.id;

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          userId: participantUserId,
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.reason).toBeNull();
    });

    it("creates multiple overlapping overrides", async () => {
      const createRotationResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Multiple Override Test",
          shiftDurationMinutes: 480,
          participants: [ctx.userId, participantUserId],
        }),
      });
      const rotationId = (await createRotationResponse.json()).data.id;

      // Create first override
      const override1Response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          userId: ctx.userId,
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 7200000).toISOString(), // 2 hours
        }),
      });
      expect(override1Response.status).toBe(201);

      // Create second overlapping override
      const override2Response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          userId: participantUserId,
          startAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
          endAt: new Date(Date.now() + 10800000).toISOString(), // 3 hours
        }),
      });
      expect(override2Response.status).toBe(201);
    });
  });

  describe("Coverage Gap Detection", () => {
    it("detects gap when no participants configured", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Empty Rotation",
          shiftDurationMinutes: 480,
          participants: [], // Empty participants
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/coverage`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.hasGaps).toBe(true);
      expect(body.data.gaps.length).toBeGreaterThan(0);
      expect(body.data.gaps[0].reason).toBe("No participants configured");
    });

    it("returns no gaps for valid rotation", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Valid Rotation",
          shiftDurationMinutes: 480,
          participants: [ctx.userId, participantUserId],
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/coverage`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.hasGaps).toBe(false);
      expect(body.data.gaps.length).toBe(0);
    });

    it("returns 404 for non-existent rotation coverage", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${randomUUID()}/coverage`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Calendar View", () => {
    it("gets calendar schedule for rotation", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Calendar Test Rotation",
          shiftDurationMinutes: 480, // 8 hours
          participants: [ctx.userId, participantUserId],
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/calendar?days=7`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.schedule).toBeDefined();
      expect(Array.isArray(body.data.schedule)).toBe(true);
    });

    it("includes overrides in calendar view", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Calendar Override Test",
          shiftDurationMinutes: 480,
          participants: [ctx.userId],
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      // Add an override
      await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          userId: participantUserId,
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 86400000).toISOString(), // 24 hours
        }),
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/calendar?days=7`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.overrides).toBeDefined();
      expect(Array.isArray(body.data.overrides)).toBe(true);
    });

    it("supports different day ranges", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Day Range Test",
          shiftDurationMinutes: 1440, // 24 hours
          participants: [ctx.userId],
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      // Test different day ranges
      for (const days of [1, 7, 14, 30]) {
        const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/calendar?days=${days}`, {
          method: "GET",
          headers: ctx.headers,
        });

        expect(response.status).toBe(200);
      }
    });

    it("returns 404 for calendar of non-existent rotation", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${randomUUID()}/calendar`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Handoff Notifications", () => {
    it("triggers manual handoff notification", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Handoff Test Rotation",
          shiftDurationMinutes: 480,
          participants: [ctx.userId, participantUserId],
          handoffChannels: ["email"],
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/handoff`, {
        method: "POST",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.notified).toBe(true);
      expect(body.data.channels).toContain("email");
    });

    it("returns 404 for handoff of non-existent rotation", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${randomUUID()}/handoff`, {
        method: "POST",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Authorization", () => {
    it("requires authentication for all endpoints", async () => {
      const endpoints = [
        { method: "GET", path: "/api/v1/oncall/rotations" },
        { method: "POST", path: "/api/v1/oncall/rotations" },
        { method: "PATCH", path: `/api/v1/oncall/rotations/${randomUUID()}` },
        { method: "DELETE", path: `/api/v1/oncall/rotations/${randomUUID()}` },
        { method: "POST", path: `/api/v1/oncall/rotations/${randomUUID()}/overrides` },
        { method: "GET", path: `/api/v1/oncall/rotations/${randomUUID()}/coverage` },
        { method: "GET", path: `/api/v1/oncall/rotations/${randomUUID()}/calendar` },
        { method: "POST", path: `/api/v1/oncall/rotations/${randomUUID()}/handoff` },
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(`${API_BASE_URL}${endpoint.path}`, {
          method: endpoint.method,
          headers: { "Content-Type": "application/json" },
        });

        expect(response.status).toBe(401);
      }
    });

    it("allows read scope to list and view rotations", async () => {
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-oncall", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
    });

    it("requires write scope to create rotation", async () => {
      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-oncall-create", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Read Only Test",
          shiftDurationMinutes: 480,
          participants: [ctx.userId],
        }),
      });

      expect(response.status).toBe(403);
    });

    it("requires write scope to update rotation", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Update Auth Test",
          shiftDurationMinutes: 480,
          participants: [ctx.userId],
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-oncall-update", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(response.status).toBe(403);
    });

    it("requires write scope to create override", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Override Auth Test",
          shiftDurationMinutes: 480,
          participants: [ctx.userId],
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-oncall-override", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: participantUserId,
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      });

      expect(response.status).toBe(403);
    });

    it("requires write scope to trigger handoff", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Handoff Auth Test",
          shiftDurationMinutes: 480,
          participants: [ctx.userId],
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      const { token: readOnlyToken } = await insertApiKey(
        ctx.organizationId,
        ctx.userId,
        { name: "read-only-oncall-handoff", scopes: ["read"] }
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/handoff`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readOnlyToken}`,
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Organization Isolation", () => {
    let otherCtx: TestContext;
    let otherRotationId: string;

    beforeAll(async () => {
      otherCtx = await bootstrapTestContext();

      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: otherCtx.headers,
        body: JSON.stringify({
          name: "Other Org Rotation",
          shiftDurationMinutes: 480,
          participants: [otherCtx.userId],
        }),
      });
      otherRotationId = (await createResponse.json()).data.id;
    });

    it("cannot update rotation from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${otherRotationId}`, {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({ name: "Hacked" }),
      });

      expect(response.status).toBe(404);
    });

    it("cannot delete rotation from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${otherRotationId}`, {
        method: "DELETE",
        headers: ctx.headers,
      });

      // Should return success=true but deleted=false since it doesn't match org
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.deleted).toBe(false);
    });

    it("cannot access coverage from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${otherRotationId}/coverage`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });

    it("cannot access calendar from another organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${otherRotationId}/calendar`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(404);
    });

    it("list only returns rotations from own organization", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "GET",
        headers: ctx.headers,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      const rotationIds = body.data.map((r: any) => r.id);
      expect(rotationIds).not.toContain(otherRotationId);
    });
  });

  describe("Validation", () => {
    it("rejects missing required fields", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          // Missing name, shiftDurationMinutes, participants
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "",
          shiftDurationMinutes: 480,
          participants: [ctx.userId],
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects negative shift duration", async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Invalid Duration",
          shiftDurationMinutes: -60,
          participants: [ctx.userId],
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects override with end before start", async () => {
      const createResponse = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          name: "Invalid Override Test",
          shiftDurationMinutes: 480,
          participants: [ctx.userId],
        }),
      });
      const rotationId = (await createResponse.json()).data.id;

      const now = Date.now();
      const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          userId: ctx.userId,
          startAt: new Date(now + 3600000).toISOString(), // 1 hour later
          endAt: new Date(now).toISOString(), // Now (before start)
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});

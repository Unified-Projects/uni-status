import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("On-call API", () => {
  let ctx: TestContext;
  let rotationId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  it("creates an on-call rotation", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Primary",
        description: "Primary rotation",
        timezone: "UTC",
        rotationStart: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        shiftDurationMinutes: 60,
        participants: [ctx.userId],
        handoffNotificationMinutes: 30,
        handoffChannels: [],
        active: true,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    rotationId = body.data.id;
  });

  it("adds an override", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/overrides`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        userId: ctx.userId,
        startAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        endAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        reason: "Coverage",
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns coverage info without gaps", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/coverage`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.hasGaps).toBe(false);
  });

  it("returns a calendar schedule", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/oncall/rotations/${rotationId}/calendar?days=2`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.schedule.length).toBeGreaterThan(0);
  });
});

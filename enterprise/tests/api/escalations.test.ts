import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Escalations API", () => {
  let ctx: TestContext;
  let channelId: string;
  let policyId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    // Seed a channel for escalation steps
    const channelRes = await fetch(`${API_BASE_URL}/api/v1/alerts/channels`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Escalation Email",
        type: "email",
        config: { email: "escalate@example.com" },
        enabled: true,
      }),
    });
    const channelBody = await channelRes.json();
    channelId = channelBody.data.id;
  });

  it("creates an escalation policy with steps", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/escalations`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "P1 Escalation",
        description: "Notify on critical incidents",
        ackTimeoutMinutes: 10,
        active: true,
        steps: [
          { stepNumber: 1, delayMinutes: 0, channels: [channelId], notifyOnAckTimeout: true },
          { stepNumber: 2, delayMinutes: 5, channels: [channelId], notifyOnAckTimeout: true },
        ],
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    policyId = body.data.id;
    expect(body.data.steps.length).toBe(2);
  });

  it("lists escalation policies", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/escalations`, {
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const ids = body.data.map((p: any) => p.id);
    expect(ids).toContain(policyId);
  });

  it("updates escalation steps", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/escalations/${policyId}`, {
      method: "PATCH",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "P1 Escalation Updated",
        steps: [{ stepNumber: 1, delayMinutes: 2, channels: [channelId], notifyOnAckTimeout: true }],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.steps.length).toBe(1);
    expect(body.data.steps[0].delayMinutes).toBe(2);
  });
});

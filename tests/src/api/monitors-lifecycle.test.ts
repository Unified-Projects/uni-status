import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Monitors lifecycle", () => {
  let ctx: TestContext;
  let monitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Lifecycle Monitor",
        url: "https://lifecycle.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
  });

  it("pauses and resumes a monitor", async () => {
    const pauseRes = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}/pause`, {
      method: "POST",
      headers: ctx.headers,
    });
    expect(pauseRes.status).toBe(200);
    const pauseBody = await pauseRes.json();
    expect(pauseBody.success).toBe(true);
    expect(pauseBody.data.status).toBe("paused");
    expect(pauseBody.data.paused).toBe(true);

    const resumeRes = await fetch(`${API_BASE_URL}/api/v1/monitors/${monitorId}/resume`, {
      method: "POST",
      headers: ctx.headers,
    });
    expect(resumeRes.status).toBe(200);
    const resumeBody = await resumeRes.json();
    expect(resumeBody.success).toBe(true);
    expect(resumeBody.data.status).toBe("pending");
    expect(resumeBody.data.paused).toBe(false);
  });
});

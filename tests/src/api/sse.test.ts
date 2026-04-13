import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

async function readFirstEvent(
  url: string,
  timeoutMs = 5000,
  headers?: Record<string, string>
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      Accept: "text/event-stream",
      ...(headers ?? {}),
    },
  });
  if (!response.body) {
    throw new Error("No SSE body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        clearTimeout(timer);
        controller.abort();
        return line.slice("event: ".length).trim();
      }
    }
  }

  clearTimeout(timer);
  controller.abort();
  throw new Error("No SSE event received");
}

describe("SSE endpoints", () => {
  let ctx: TestContext;
  let monitorId: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();

    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "SSE Monitor",
        url: "https://sse.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    monitorId = monitorBody.data.id;
  });

  it("connects to monitor SSE and receives connected event", async () => {
    const event = await readFirstEvent(
      `${API_BASE_URL}/api/v1/sse/monitors/${monitorId}`,
      5000,
      ctx.headers
    );
    expect(event).toBe("connected");
  });

  it("rejects monitor SSE without authentication", async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/sse/monitors/${monitorId}`, {
        headers: {
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      expect([400, 401, 403]).toContain(res.status);
      expect(res.status).not.toBe(200);

      controller.abort();
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name !== "AbortError") {
        throw error;
      }
    }
  });

  it("connects to status page SSE and receives connected event", async () => {
    // Status page slug can be arbitrary; SSE just connects
    const event = await readFirstEvent(`${API_BASE_URL}/api/v1/sse/status-pages/example-slug`);
    expect(event).toBe("connected");
  });
});

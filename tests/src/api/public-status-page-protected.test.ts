import { randomUUID } from "crypto";
import { bootstrapTestContext, TestContext } from "../helpers/context";
import { setMonitorStatus } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Public status page password protection", () => {
  let ctx: TestContext;
  let slug: string;
  let password: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
    slug = `protected-${Date.now()}`;
    password = `pw-${randomUUID().slice(0, 6)}`;

    // Create a monitor and set active so the page has data
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: `Protected Monitor ${randomUUID().slice(0, 6)}`,
        url: "https://protected.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    expect(monitorRes.status).toBe(201);
    const monitorBody = await monitorRes.json();
    const monitorId = monitorBody.data.id;
    await setMonitorStatus(monitorId, "active");

    // Create password-protected status page and link monitor
    const pageRes = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Protected Page",
        slug,
        published: true,
        password,
        passwordProtected: true,
      }),
    });
    expect(pageRes.status).toBe(201);
    const pageBody = await pageRes.json();
    const statusPageId = pageBody.data.id;

    // Ensure page exists and published
    const pageGet = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
      headers: ctx.headers,
    });
    expect(pageGet.status).toBe(200);
    const pageData = await pageGet.json();
    expect(pageData.data.slug).toBe(slug);
    expect(pageData.data.published).toBe(true);

    const linkRes = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        monitorId,
        displayName: "Protected Monitor",
        order: 1,
      }),
    });
    expect(linkRes.status).toBe(201);
  });

  it("denies access without password and succeeds after verification", async () => {
    const unauthRes = await fetch(`${API_BASE_URL}/api/public/status-pages/${slug}`);
    expect([401, 404]).toContain(unauthRes.status);
    const unauthBody = await unauthRes.json();
    // API returns AUTH_REQUIRED for all auth failures, with meta.requiresPassword indicating password protection
    expect(unauthBody.error?.code).toBe("AUTH_REQUIRED");
    expect(unauthBody.meta?.requiresPassword).toBe(true);

    // Verify with wrong password
    const badVerify = await fetch(`${API_BASE_URL}/api/public/status-pages/${slug}/verify-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(badVerify.status).toBe(401);

    // Verify with correct password
    const verifyRes = await fetch(`${API_BASE_URL}/api/public/status-pages/${slug}/verify-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    const token = verifyBody.data.token;
    expect(token).toBeDefined();

    // Access with cookie
    const authRes = await fetch(`${API_BASE_URL}/api/public/status-pages/${slug}`, {
      headers: { Cookie: `sp_token_${slug}=${token}` },
    });
    expect(authRes.status).toBe(200);
    const authBody = await authRes.json();
    expect(authBody.success).toBe(true);
    expect(authBody.data.monitors.length).toBeGreaterThan(0);
  });
});

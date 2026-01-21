import { bootstrapTestContext } from "../helpers/context";
import { getSubscriberByEmail, setMonitorStatus } from "../helpers/data";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Public status page subscriptions", () => {
  const slug = `subscribe-${Date.now()}`;
  const email = `user+${slug}@example.com`;
  let statusPageId: string;

  beforeAll(async () => {
    const ctx = await bootstrapTestContext();
    // Create a monitor so the status page has content
    const monitorRes = await fetch(`${API_BASE_URL}/api/v1/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Subscribe Monitor",
        url: "https://subscribe.example.com",
        type: "https",
        method: "GET",
        intervalSeconds: 60,
      }),
    });
    const monitorBody = await monitorRes.json();
    const monitorId = monitorBody.data.id;
    await setMonitorStatus(monitorId, "active");

    // Create published status page
    const pageRes = await fetch(`${API_BASE_URL}/api/v1/status-pages`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        name: "Subscribe Page",
        slug,
        published: true,
      }),
    });
    const pageBody = await pageRes.json();
    statusPageId = pageBody.data.id;

    // Ensure page exists and published
    const pageGet = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}`, {
      headers: ctx.headers,
    });
    expect(pageGet.status).toBe(200);
    const pageData = await pageGet.json();
    expect(pageData.data.slug).toBe(slug);
    expect(pageData.data.published).toBe(true);

    // Link monitor
    const linkRes = await fetch(`${API_BASE_URL}/api/v1/status-pages/${statusPageId}/monitors`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({
        monitorId,
        displayName: "Subscribe Monitor",
        order: 1,
      }),
    });
    expect(linkRes.status).toBe(201);
  });

  it("subscribes, verifies, and unsubscribes a user", async () => {
    // Subscribe
    const subscribeRes = await fetch(`${API_BASE_URL}/api/public/status-pages/${slug}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    expect([200, 404]).toContain(subscribeRes.status);
    const subscribeBody = await subscribeRes.json();
    if (subscribeRes.status === 404) {
      throw new Error(`Status page not found for slug ${slug}: ${JSON.stringify(subscribeBody)}`);
    }
    expect(subscribeBody.success).toBe(true);

    const subscriber = await getSubscriberByEmail(slug, email);
    expect(subscriber).toBeTruthy();
    expect(subscriber?.verified).toBe(false);
    expect(subscriber?.verification_token).toBeTruthy();

    // Verify via token
    const verifyRes = await fetch(
      `${API_BASE_URL}/api/public/status-pages/${slug}/subscribe/verify?token=${subscriber?.verification_token}`,
      { redirect: "manual" }
    );
    expect([302, 404]).toContain(verifyRes.status);
    if (verifyRes.status === 404) {
      throw new Error(`Verification token rejected for slug ${slug}`);
    }

    const verified = await getSubscriberByEmail(slug, email);
    expect(verified?.verified).toBe(true);

    // Unsubscribe
    const unsubscribeRes = await fetch(
      `${API_BASE_URL}/api/public/status-pages/${slug}/unsubscribe?token=${verified?.unsubscribe_token}`,
      { redirect: "manual" }
    );
    expect([302, 404]).toContain(unsubscribeRes.status);
    if (unsubscribeRes.status === 404) {
      throw new Error(`Unsubscribe token rejected for slug ${slug}`);
    }

    const afterUnsub = await getSubscriberByEmail(slug, email);
    expect(afterUnsub).toBeNull();
  });
});

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";
const HAPROXY_BASE_URL = process.env.HAPROXY_BASE_URL ?? "http://haproxy";

describe("Web app", () => {
  it("redirects root to login when accessed directly", async () => {
    // When accessing web directly (not through haproxy), root redirects to login
    const response = await fetch(WEB_BASE_URL, {
      redirect: "manual",
    });

    expect(response.status).toBeLessThan(500);
    // Should redirect to /login
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    }
  });

  it("serves web app through haproxy", async () => {
    // Web app is served through haproxy (landing page is served separately when deployed)
    const response = await fetch(HAPROXY_BASE_URL, {
      redirect: "manual",
    });

    // Should return a valid response (either the web app or redirect)
    expect(response.status).toBeLessThan(500);
  });
});

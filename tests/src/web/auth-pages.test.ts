const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Auth pages", () => {
  describe("Login page", () => {
    it("renders the login page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/login`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("contains a login form", async () => {
      const response = await fetch(`${WEB_BASE_URL}/login`, {
        redirect: "manual",
      });

      const html = await response.text();
      // Should have email/password inputs or form elements
      expect(html.toLowerCase()).toMatch(/email|password|sign.?in|log.?in/);
    });
  });

  describe("Register page", () => {
    it("renders the register page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/register`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });

    it("contains a registration form", async () => {
      const response = await fetch(`${WEB_BASE_URL}/register`, {
        redirect: "manual",
      });

      const html = await response.text();
      // Should have registration-related content
      expect(html.toLowerCase()).toMatch(/email|password|sign.?up|register|create.*account/);
    });
  });

  describe("Setup organisation page", () => {
    it("renders the setup organisation page or redirects", async () => {
      const response = await fetch(`${WEB_BASE_URL}/setup-organisation`, {
        redirect: "manual",
      });

      // This page may redirect to login if not authenticated
      // Accept either a successful render or a redirect
      expect(response.status).toBeLessThan(500);

      if (response.status === 200) {
        const html = await response.text();
        expect(html.toLowerCase()).toContain("<!doctype html");
      } else if (response.status >= 300 && response.status < 400) {
        // Redirect is acceptable for this auth-required page
        expect(response.headers.get("location")).toBeTruthy();
      }
    });
  });
});

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://web:3000";

describe("Public pages", () => {
  describe("Demo page", () => {
    it("renders the demo page", async () => {
      const response = await fetch(`${WEB_BASE_URL}/demo`, {
        redirect: "manual",
      });

      expect(response.status).toBeLessThan(500);
      const html = await response.text();
      expect(html.toLowerCase()).toContain("<!doctype html");
    });
  });

});

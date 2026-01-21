const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("API health endpoints", () => {
  it("returns basic health status", async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
  });

  it("reports ready when dependencies are available", async () => {
    const response = await fetch(`${API_BASE_URL}/health/ready`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.checks?.database).toBe("ok");
  });
});

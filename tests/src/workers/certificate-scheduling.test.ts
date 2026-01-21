import { shouldQueueCertificateCheck } from "../../../apps/workers/src/lib/certificate-scheduling";

describe("certificate scheduling", () => {
  it("queues HTTPS monitors by default", () => {
    const monitor = { type: "https", config: {} };
    expect(shouldQueueCertificateCheck(monitor)).toBe(true);
  });

  it("skips monitors when certificate monitoring is disabled", () => {
    const monitor = { type: "https", config: { ssl: { enabled: false } } };
    expect(shouldQueueCertificateCheck(monitor)).toBe(false);
  });

  it("queues SSL monitors unless explicitly disabled", () => {
    expect(shouldQueueCertificateCheck({ type: "ssl", config: {} })).toBe(true);
    expect(shouldQueueCertificateCheck({ type: "ssl", config: { ssl: { enabled: false } } })).toBe(false);
  });

  it("ignores non-certificate monitor types", () => {
    const monitor = { type: "http", config: {} };
    expect(shouldQueueCertificateCheck(monitor)).toBe(false);
  });
});

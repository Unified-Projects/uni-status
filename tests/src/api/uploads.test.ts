import { bootstrapTestContext, TestContext } from "../helpers/context";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:3001";

describe("Uploads API", () => {
  let ctx: TestContext;
  let uploadedFilename: string;

  beforeAll(async () => {
    ctx = await bootstrapTestContext();
  });

  it("uploads an image file", async () => {
    const formData = new FormData();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    formData.append("file", new Blob([pngBytes], { type: "image/png" }), "test.png");

    const response = await fetch(`${API_BASE_URL}/api/v1/uploads`, {
      method: "POST",
      headers: {
        Authorization: ctx.headers.Authorization!,
      },
      body: formData,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.url).toMatch(/^https?:\/\/.+\/api\/uploads\//);
    expect(body.data.path).toMatch(/^\/api\/uploads\//);
    const asset = await fetch(body.data.url);
    expect(asset.status).toBe(200);
    uploadedFilename = body.data.filename;
    expect(uploadedFilename).toMatch(/\.png$/);
  });

  it("deletes the uploaded file", async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/uploads/${uploadedFilename}`, {
      method: "DELETE",
      headers: ctx.headers,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });
});

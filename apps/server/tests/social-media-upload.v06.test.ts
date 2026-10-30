import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createSocialMediaRouter, getSocialMediaStorageDir } from "../src/social/media-upload";

describe("BUG-03: Media-Upload in Connect Sozial (/api/social/media)", () => {
  it("getSocialMediaStorageDir liefert einen gueltigen Pfad", () => {
    const dir = getSocialMediaStorageDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("POST /api/social/media lehnt Nicht-Multipart-Requests mit 400 ab", async () => {
    const app = new Hono();
    const router = createSocialMediaRouter();
    app.route("/api/social/media", router);

    const res = await app.request("/api/social/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: "invalid" }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(false);
  });

  it("POST /api/social/media laedt eine Bilddatei erfolgreich hoch und GET liefert sie aus", async () => {
    const app = new Hono();
    const router = createSocialMediaRouter();
    app.route("/api/social/media", router);

    const formData = new FormData();
    const dummyBlob = new Blob(["fake-image-bytes-png"], { type: "image/png" });
    formData.append("file", dummyBlob, "test-pic.png");
    formData.append("uploadedBy", "TestBot");

    const uploadRes = await app.request("/api/social/media", {
      method: "POST",
      body: formData,
    });

    expect(uploadRes.status).toBe(201);
    const uploadData = (await uploadRes.json()) as {
      ok: boolean;
      id: string;
      filename: string;
      url: string;
      mediaUrl: string;
    };

    expect(uploadData.ok).toBe(true);
    expect(typeof uploadData.id).toBe("string");
    expect(uploadData.filename.endsWith(".png")).toBe(true);
    expect(uploadData.url).toBe(`/api/social/media/${uploadData.filename}`);
    expect(uploadData.mediaUrl).toBe(uploadData.url);

    // Jetzt per GET abrufen
    const getRes = await app.request(`/api/social/media/${uploadData.filename}`);
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("content-type")).toBe("image/png");
    const content = await getRes.text();
    expect(content).toBe("fake-image-bytes-png");
  });

  it("GET /api/social/media/unknown.png antwortet mit 404", async () => {
    const app = new Hono();
    const router = createSocialMediaRouter();
    app.route("/api/social/media", router);

    const res = await app.request("/api/social/media/non-existent-file-xyz.png");
    expect(res.status).toBe(404);
  });
});

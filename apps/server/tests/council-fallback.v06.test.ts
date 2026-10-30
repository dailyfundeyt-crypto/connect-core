import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  createCouncilFallbackRouter,
  handleCouncilRoot,
  registerCouncilFallbackRoutes,
} from "../src/routes/council-fallback";

describe("BUG-08: Fehlende Fallback-Route für /api/council (Root-404)", () => {
  it("GET /api/council antwortet mit HTTP 200 und status: ok", async () => {
    const app = new Hono();
    registerCouncilFallbackRoutes(app);

    const res = await app.request("/api/council");
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      status: string;
      council: boolean;
      module: string;
      endpoints: Record<string, string>;
    };

    expect(data.status).toBe("ok");
    expect(data.council).toBe(true);
    expect(data.module).toBe("council");
    expect(data.endpoints.health).toBe("/api/council/health");
  });

  it("handleCouncilRoot liefert status: ok und 200", () => {
    let capturedBody: any = null;
    let capturedStatus = 0;
    const fakeContext = {
      json: (body: any, status = 200) => {
        capturedBody = body;
        capturedStatus = status;
        return new Response(JSON.stringify(body), { status });
      },
    } as any;

    const res = handleCouncilRoot(fakeContext);
    expect(capturedStatus).toBe(200);
    expect(capturedBody.status).toBe("ok");
    expect(capturedBody.council).toBe(true);
    expect(res.status).toBe(200);
  });
});

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createUsageRootRouter, handleUsageRoot } from "../src/usage/root-route";

describe("BUG-02: Root-Aufruf von /api/usage", () => {
  it("GET /api/usage leitet per 302 auf /api/usage/summary weiter", async () => {
    const app = new Hono();
    const router = createUsageRootRouter();
    app.route("/api/usage", router);

    const res = await app.request("/api/usage");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/api/usage/summary");
  });

  it("handleUsageRoot liefert einen gueltigen Redirect-Response", () => {
    let redirectedTo = "";
    let statusCode = 0;
    const fakeContext = {
      redirect: (url: string, status: number) => {
        redirectedTo = url;
        statusCode = status;
        return new Response(null, { status, headers: { Location: url } });
      },
    } as any;

    const res = handleUsageRoot(fakeContext);
    expect(redirectedTo).toBe("/api/usage/summary");
    expect(statusCode).toBe(302);
    expect(res.status).toBe(302);
  });
});

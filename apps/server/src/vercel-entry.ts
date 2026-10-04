/*
 * Vercel Function entry (Bun runtime): the same Hono app as index.ts, without the LISTEN connections,
 * background loops and Bun.serve that need an always-on process (see `serverless` in index.ts).
 *
 * Not available here, by design: WebSocket upgrades (channel activity push, the live computer
 * stream), the hand-off/summary/reaper loops, and anything that launches programs on the host
 * (agent Chrome via CDP, adb, Invoke-Codex). Those keep running on the desktop / localhost install.
 */
import "./serverless-flag";
import "eventsource";
import { app } from "./index";

export default {
  fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);
    // The app answers /health; the hosted site is only reachable under /api.
    if (url.pathname === "/api/health") {
      url.pathname = "/health";
      return app.fetch(new Request(url, request));
    }
    return app.fetch(request);
  },
};
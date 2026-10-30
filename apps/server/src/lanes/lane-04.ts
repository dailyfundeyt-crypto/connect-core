import type { Hono as HonoApp } from "hono";
import { createTranscriberRouter } from "../agents/templates/transcriber";

/**
 * Lane 04: Transcriber-Agent (Instagram->Spark) & Settings
 */
export function registerLane04Routes(app: HonoApp<any, any, any>): void {
  app.route("/api/agents/templates/transcriber", createTranscriberRouter());
}

export default registerLane04Routes;

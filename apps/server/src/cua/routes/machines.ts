/**
 * Cua-Maschinen HTTP-Routen.
 *
 * Lane: A19
 * Routen:
 * - GET  /api/machines
 * - POST /api/machines
 * - POST /api/machines/:id/wake
 * - POST /api/machines/:id/sleep
 * - GET  /api/machines/:id/screen
 * - GET  /api/machines/mode
 * - PUT  /api/machines/mode
 * - PUT  /api/agents/:id/machine
 * - GET  /api/machines/doctor
 */

import { Hono } from "hono";
import type { AppVariables } from "../../auth/guards";
import type { CuaMachineService } from "../service";
import type { MachineKind, MachineMode } from "../types";

export function createMachineRoutes(
  service: CuaMachineService,
  options?: {
    /** Optionale Übersteuerung der Flag-Prüfung für Tests */
    ignoreFlag?: boolean;
    /** Fallback-User-ID, falls Route ohne Auth-Guard läuft */
    defaultUserId?: string;
  },
) {
  const routes = new Hono<{ Variables: AppVariables }>();

  // Feature-Flag Middleware: Alle Routen verlangen connect.flags.t3 (cuaMachines)
  routes.use("*", async (c, next) => {
    if (!options?.ignoreFlag && !service.isEnabled()) {
      return c.json({ error: "Cua-Maschinen-Feature ist derzeit deaktiviert (Flag cuaMachines)." }, 503);
    }
    await next();
  });

  // Hilfsfunktion zur Ermittlung des Nutzers
  function getActorId(c: { var?: { actor?: { id?: string } } }): string {
    return c.var?.actor?.id ?? options?.defaultUserId ?? "default-user";
  }

  /**
   * GET /api/machines
   * Listet alle Maschinen auf.
   */
  routes.get("/", async (c) => {
    try {
      const userId = getActorId(c);
      const list = await service.listMachines(userId);
      return c.json(list, 200);
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  /**
   * POST /api/machines
   * Erstellt eine neue Maschine (erfordert Consent).
   */
  routes.post("/", async (c) => {
    try {
      const userId = getActorId(c);
      const body = await c.req.json().catch(() => ({})) as {
        name?: string;
        kind?: MachineKind;
        owner?: string;
      };

      const newMachine = await service.createCustomMachine(userId, {
        name: body.name,
        kind: body.kind,
        owner: body.owner,
      });

      return c.json(newMachine, 201);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("verweigert") ? 403 : 500;
      return c.json({ error: msg }, status);
    }
  });

  /**
   * GET /api/machines/doctor
   * Windows- & Cua-Preflight Diagnose.
   */
  routes.get("/doctor", async (c) => {
    try {
      const doc = await service.doctor();
      return c.json(doc, 200);
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  /**
   * GET /api/machines/mode
   * Ruft den Betriebsmodus ab (shared | per_agent).
   */
  routes.get("/mode", async (c) => {
    try {
      const userId = getActorId(c);
      const mode = await service.getMode(userId);
      return c.json({ mode }, 200);
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  /**
   * PUT /api/machines/mode
   * Wechselt den Betriebsmodus (shared | per_agent).
   */
  routes.put("/mode", async (c) => {
    try {
      const userId = getActorId(c);
      const body = (await c.req.json().catch(() => ({}))) as { mode?: MachineMode };

      if (!body.mode || (body.mode !== "shared" && body.mode !== "per_agent")) {
        return c.json({ error: "Gueltiger 'mode' (shared | per_agent) erforderlich." }, 400);
      }

      const result = await service.setMode(userId, body.mode);
      return c.json(result, 200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes("verweigert") ? 403 : 500;
      return c.json({ error: msg }, status);
    }
  });

  /**
   * POST /api/machines/:id/wake
   * Weckt eine schlafende Maschine auf.
   */
  routes.post("/:id/wake", async (c) => {
    const id = c.req.param("id");
    try {
      const updated = await service.wake(id);
      return c.json(updated, 200);
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  /**
   * POST /api/machines/:id/sleep
   * Legt eine Maschine in den Ruhezustand (suspend).
   */
  routes.post("/:id/sleep", async (c) => {
    const id = c.req.param("id");
    try {
      const updated = await service.sleep(id);
      return c.json(updated, 200);
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  /**
   * GET /api/machines/:id/screen
   * Bildschirm-Snapshot (gedrosselt auf 2–5 fps, ruht bei Schlaf).
   */
  routes.get("/:id/screen", async (c) => {
    const id = c.req.param("id");
    const tabOpenQuery = c.req.query("tabOpen");
    const tabOpenHeader = c.req.header("x-tab-open");
    const tabOpen = tabOpenQuery === "false" || tabOpenHeader === "false" ? false : true;

    try {
      const screen = await service.getScreen(id, { tabOpen });

      const accept = c.req.header("accept") || "";
      if (accept.includes("application/json")) {
        return c.json(
          {
            mimeType: screen.mimeType,
            isCached: screen.isCached,
            isSleeping: screen.isSleeping,
            timestamp: screen.timestamp,
            dataBase64: Buffer.from(screen.data).toString("base64"),
          },
          200,
        );
      }

      return new Response(Buffer.from(screen.data), {
        status: 200,
        headers: {
          "Content-Type": screen.mimeType,
          "X-Cua-Cached": screen.isCached ? "1" : "0",
          "X-Cua-Sleeping": screen.isSleeping ? "1" : "0",
          "X-Cua-Timestamp": screen.timestamp,
        },
      });
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  /**
   * PUT /api/agents/:id/machine
   * Weist einem Bot eine bestimmte Maschine zu.
   */
  routes.put("/agents/:id/machine", async (c) => {
    const agentId = c.req.param("id");
    try {
      const body = (await c.req.json().catch(() => ({}))) as { machineId?: string };
      if (!body.machineId) {
        return c.json({ error: "Feld 'machineId' erforderlich." }, 400);
      }

      const assignment = await service.assignAgentToMachine(agentId, body.machineId);
      return c.json(assignment, 200);
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  return routes;
}

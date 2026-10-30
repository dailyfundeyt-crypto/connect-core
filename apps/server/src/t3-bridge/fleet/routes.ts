/**
 * T3-Bridge — Flotten-Routen (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Endpunkte (A37 mountet sie unter `/api/t3/fleet`):
 *
 *  - `GET  /` → die Flotten-Ansicht (Agenten, Summen, PC-Last, Limits)
 *  - `POST /parse-backlog` → parst ein Backlog-Dokument (roh oder als Pfad)
 *  - `POST /batch-create` → legt Agenten aus Ideen an — **nur mit `confirm`**
 *
 * Feature-Flag: `bridge` (A01). Ist das Flag aus, antworten die Endpunkte
 * mit 503 und tun nichts. Connect verhält sich damit wie vor A36.
 *
 * Alle Routen gehen durch `requireUser`: das Anlegen von 40 Agenten ist
 * etwas, das nur jemand darf, der angemeldet ist.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { Hono, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../../auth/guards";
import type { AgentActor } from "../../agents/profile-types";
import { getT3Flag } from "../contracts";

import { parseIdeaBacklog } from "./backlog-parser";
import { FleetService, type FleetServiceOptions } from "./service";
import {
  isFleetCliId,
  type FleetBatchRequest,
  type FleetIdea,
} from "./types";

export type CreateFleetRoutesOptions = FleetServiceOptions & {
  /** Wie ein Agent angelegt wird (Standard: der Service). */
  requireUser?: MiddlewareHandler<{ Variables: AppVariables }>;
  /** Nur für Tests: umgeht den Feature-Flag-Guard. */
  enableFlagBypass?: boolean;
  /** Der Pfad zum Backlog-Dokument (Standard: `docs/ideen/IDEEN-BACKLOG.md`). */
  backlogPath?: string;
  /** Die Quelle, aus der das Backlog gelesen wird (Tests). */
  readBacklogFile?: (path: string) => Promise<string>;};

/** Der Standardpfad des Backlogs, relativ zum Repository-Wurzel. */
export const DEFAULT_BACKLOG_PATH = "docs/ideen/IDEEN-BACKLOG.md";

/**
 * Wandelt den Kontext in den Actor, den der Agenten-Store erwartet.
 *
 * Ohne angemeldete Person (also ohne `requireUser`) gibt es keinen Actor —
 * dann wird ein technischer Ersatz benutzt, damit die Route antwortet statt
 * zu stürzen. Im Betrieb ist `requireUser` immer gesetzt.
 */
function toActor(context: { var: AppVariables }): AgentActor {
  const actor = context.var?.actor;
  if (!actor) {
    return { id: "anonymous", role: "admin" };
  }
  return {
    id: actor.id,
    role: actor.role,
  };
}

/**
 * Prüft eine rohe Idee aus dem Browser.
 *
 * Der Browser schickt die Ideen als JSON; eine manipulierte Anfrage könnte
 * einen beliebigen Namen oder eine beliebige CLI mitschicken. Deshalb wird
 * jede Idee hier noch einmal geprüft — der Server vertraut dem Browser
 * nicht.
 */
export function sanitizeIdea(input: unknown): FleetIdea | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";

  if (!title) return null;
  if (!isFleetCliId(raw.cli)) return null;

  return {
    id,
    title: title.slice(0, 200),
    cli: raw.cli,
    name: (name || title).slice(0, 120),
    description: (description || title).slice(0, 500),
  };
}

/**
 * Erstellt den Hono-Router für die Flotten-API.
 */
export function createFleetRoutes(
  options: CreateFleetRoutesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const router = new Hono<{ Variables: AppVariables }>();
  const service = new FleetService(options);
  const readFileFn: (path: string) => Promise<string> =
    options.readBacklogFile ?? ((path: string) => readFile(path, "utf8"));
  const backlogPath = options.backlogPath ?? DEFAULT_BACKLOG_PATH;

  const bridgeActive = () =>
    options.enableFlagBypass === true || getT3Flag("bridge");

  if (options.requireUser) {
    router.use("*", options.requireUser);
  }

  /* -------------------------------------------------------------------------------------- *
   * GET / — die Flotten-Ansicht
   * -------------------------------------------------------------------------------------- */
  router.get("/", async (c) => {
    if (!bridgeActive()) {
      return c.json(
        { error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert." },
        503,
      );
    }

    try {
      const overview = await service.overview(toActor(c));
      return c.json(overview, 200);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Die Flotten-Ansicht konnte nicht geladen werden.",
        },
        500,
      );
    }
  });

  /* -------------------------------------------------------------------------------------- *
   * POST /parse-backlog — das Backlog lesen
   * -------------------------------------------------------------------------------------- */
  router.post("/parse-backlog", async (c) => {
    if (!bridgeActive()) {
      return c.json(
        { error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert." },
        503,
      );
    }

    const body = (await c.req.json().catch(() => null)) as {
      markdown?: unknown;
      path?: unknown;
    } | null;

    let markdown: string;

    if (typeof body?.markdown === "string" && body.markdown.trim()) {
      markdown = body.markdown;
    } else {
      const requested =
        typeof body?.path === "string" && body.path.trim()
          ? body.path.trim()
          : backlogPath;
      const absolute = isAbsolute(requested)
        ? requested
        : resolve(process.cwd(), requested);
      try {
        markdown = await readFileFn(absolute);
      } catch (error) {
        return c.json(
          {
            error: `Das Backlog konnte nicht gelesen werden: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
          404,
        );
      }
    }

    const book = parseIdeaBacklog(markdown);
    return c.json(
      {
        ideas: book.ideas,
        skipped: book.skipped,
        count: book.ideas.length,
      },
      200,
    );
  });

  /* -------------------------------------------------------------------------------------- *
   * POST /batch-create — die Massen-Anlage
   * -------------------------------------------------------------------------------------- */
  router.post("/batch-create", async (c) => {
    if (!bridgeActive()) {
      return c.json(
        { error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert." },
        503,
      );
    }

    const body = (await c.req.json().catch(() => null)) as {
      ideas?: unknown;
      confirm?: unknown;
      visibility?: unknown;
    } | null;

    if (!body || typeof body !== "object" || !Array.isArray(body.ideas)) {
      return c.json(
        { error: "Es wurden keine Ideen übergeben." },
        400,
      );
    }

    const ideas: FleetIdea[] = [];
    for (const entry of body.ideas) {
      const idea = sanitizeIdea(entry);
      if (idea) ideas.push(idea);
    }

    if (ideas.length === 0) {
      return c.json(
        { error: "Keine der übergebenen Ideen war lesbar." },
        400,
      );
    }

    const visibility =
      body.visibility === "public" ? "public" : body.visibility === "private" ? "private" : undefined;

    const request: FleetBatchRequest = {
      ideas,
      confirm: body.confirm === true,
      visibility,
    };

    const result = await service.createFromIdeas(toActor(c), request);
    return c.json(result, 200);
  });

  return router;
}

export default createFleetRoutes;

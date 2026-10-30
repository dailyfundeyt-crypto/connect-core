/**
 * REST API-Routen für Zukunfts-Simulation v06 (A30).
 *
 * Bereitgestellte Endpunkte:
 * - GET  /api/v06/future-sim/runs       -> FutureSimRun[]
 * - POST /api/v06/future-sim/runs       -> FutureSimRun (Neuer Simulationslauf)
 * - GET  /api/v06/future-sim/runs/:id   -> FutureSimRun & Details
 * - GET  /api/v06/future-sim/runs/:id/report -> FutureSimReport (Markdown-Report)
 *
 * Feature-Flag: FLAGS_V06.futureSim
 */

import { Hono, type MiddlewareHandler } from "hono";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { getFlag } from "../../contracts/v06/flags";
import type { FutureSimRun } from "../../contracts/v06/future-sim";
import type {
  FutureSimAdapter,
  FutureSimReport,
  SimulationRunResult,
} from "./adapter";
import { GeminiDebateEngine } from "./debate";
import { defaultMockAdapter, MockFutureSimAdapter } from "./mockAdapter";

export interface FutureSimRoutesOptions {
  mockAdapter?: FutureSimAdapter;
  geminiEngine?: FutureSimAdapter;
  requireUser?: MiddlewareHandler;
}

export interface StoredSimRun extends FutureSimRun {
  result?: SimulationRunResult;
  report?: FutureSimReport;
  createdAt: string;
}

export class FutureSimRunStore {
  private runs: Map<string, StoredSimRun> = new Map();

  public listRuns(companyId?: string): FutureSimRun[] {
    const all = Array.from(this.runs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (!companyId) return all;
    return all.filter((r) => r.companyId === companyId);
  }

  public getRun(id: string): StoredSimRun | undefined {
    return this.runs.get(id);
  }

  public saveRun(run: StoredSimRun): StoredSimRun {
    this.runs.set(run.id, run);
    return run;
  }

  public clear(): void {
    this.runs.clear();
  }
}

export const defaultSimStore = new FutureSimRunStore();

export function createFutureSimRouter(options: FutureSimRoutesOptions = {}): Hono {
  const router = new Hono();
  const mockAdapter = options.mockAdapter ?? defaultMockAdapter;
  const geminiEngine = options.geminiEngine ?? new GeminiDebateEngine();
  const store = defaultSimStore;

  // 1. Feature-Flag Guard
  router.use("*", async (c, next) => {
    if (!getFlag("futureSim")) {
      return c.json(
        { error: "Feature flag 'futureSim' ist deaktiviert." },
        404,
      );
    }
    await next();
  });

  // 2. Optionale Authentifizierungs-Middleware
  if (options.requireUser) {
    router.use("*", options.requireUser);
  }

  // GET /api/v06/future-sim/runs
  router.get("/", (c) => {
    const companyId = c.req.query("companyId");
    const runs = store.listRuns(companyId || undefined);
    return c.json(runs);
  });

  // POST /api/v06/future-sim/runs
  router.post("/", async (c) => {
    try {
      const body = (await c.req.json()) as {
        companyId?: string;
        planFiles?: string[];
        question?: string;
        engine?: "mock" | "gemini" | "mirofish";
        reportPath?: string;
      };

      if (!body.question || body.question.trim().length === 0) {
        return c.json(
          { error: "Pflichtfeld 'question' fehlt oder ist leer." },
          400,
        );
      }

      const companyId = body.companyId || "kunc-gmbh";
      const planFiles = body.planFiles && body.planFiles.length > 0
        ? body.planFiles
        : ["Vault/Plans/Hauptfokus-2026.md"];
      const defaultEngine = options.geminiEngine ? "gemini" : (options.mockAdapter ? "mock" : "gemini");
      const engineKind = body.engine ?? defaultEngine;

      // Adapter-Auswahl: Standard ist Option B (Gemini-CLI Debatte, 0 € Zusatzkosten)
      const adapter: FutureSimAdapter =
        engineKind === "gemini" ? geminiEngine : mockAdapter;

      // 1. Vorbereitung
      const prep = await adapter.prepare(planFiles, companyId);

      // 2. Ausführung
      const simResult = await adapter.run(body.question, prep);

      // 3. Bericht erstellen
      const report = await adapter.report(simResult);

      const runRecord: StoredSimRun = {
        id: simResult.runId,
        companyId,
        planFiles,
        question: body.question,
        status: "completed",
        reportPath: body.reportPath ?? report.savedPath,
        result: simResult,
        report,
        createdAt: new Date().toISOString(),
      };

      store.saveRun(runRecord);

      const responseContract: FutureSimRun = {
        id: runRecord.id,
        companyId: runRecord.companyId,
        planFiles: runRecord.planFiles,
        question: runRecord.question,
        status: runRecord.status,
        reportPath: runRecord.reportPath,
      };

      return c.json(responseContract, 201);
    } catch (err: any) {
      return c.json(
        { error: err.message || "Fehler beim Ausführen der Zukunfts-Simulation." },
        500,
      );
    }
  });

  // GET /api/v06/future-sim/runs/:id
  router.get("/:id", (c) => {
    const id = c.req.param("id");
    const run = store.getRun(id);
    if (!run) {
      return c.json({ error: "Simulationslauf nicht gefunden." }, 404);
    }
    return c.json(run);
  });

  // GET /api/v06/future-sim/runs/:id/report
  router.get("/:id/report", (c) => {
    const id = c.req.param("id");
    const run = store.getRun(id);
    if (!run || !run.report) {
      return c.json({ error: "Bericht für diesen Lauf nicht gefunden." }, 404);
    }
    return c.json({ ok: true, report: run.report });
  });

  return router;
}

/**
 * Registriert die Zukunfts-Simulations-Routen auf einer Hono-App.
 * Vorgesehen für den Integrations-Agenten (A33 / Wave 3).
 */
export function registerFutureSimRoutes(
  app: Hono<any, any, any>,
  options: FutureSimRoutesOptions = {},
): void {
  const router = createFutureSimRouter(options);
  app.route(API_PATHS_V06.futureSimRuns, router);
}

export default registerFutureSimRoutes;

import type { Hono as HonoApp, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { getFlag } from "../../contracts/v06/flags";
import { brainRootFor, resolveBrainRoot, listAllMarkdown } from "../../brain/store";
import {
  buildCompanyStructureOverview,
  clusterIdOf,
  folderOf,
} from "./aggregate";
import { agentDataAccess } from "./agentAccess";

export type SparkOverviewRouteOptions = {
  /** Vom Integrator gebunden (createApp): der normale Session-Guard. */
  requireUser?: MiddlewareHandler<{ Variables: { actor?: { role: string } } }>;
  /** Root-Auflösung für Tests oder explizite Konfiguration. */
  brainRoot?: string | null;
};

/**
 * Der Brain ist eine lokale Struktur (Regeln wie in brain/routes.ts): ohne
 * eingeloggt-Aktor nur auf demselben Rechner beantworten, damit keine
 * fremde Quelle die Notizstruktur abfragen kann.
 */
function isLocalhostHost(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const host = (c.req.header("host") ?? "").toLowerCase();
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]") || host === "::1";
}

/** Router mit beiden v06-Endpunkten; Flag-Guard gemeinsam vor dem Rest. */
export function createSparkOverviewRouter(options: SparkOverviewRouteOptions = {}): Hono {
  const router = new Hono();

  router.use("*", async (c, next) => {
    if (!getFlag("sparkOverview")) {
      return c.json(
        { error: "Spark-Übersicht ist deaktiviert.", flag: "sparkOverview", status: "disabled" },
        503,
      );
    }
    await next();
  });

  if (options.requireUser) {
    router.use("*", options.requireUser);
  } else if (!(process.env.NODE_ENV === "test")) {
    router.use("*", async (c, next) => {
      if ((c.var as { actor?: unknown })?.actor) return next();
      if (isLocalhostHost(c)) return next();
      return c.json({ error: "Spark-Übersicht ist nur lokal erreichbar." }, 403);
    });
  }

  /** Der Brain-Ordner in Kraft, zur gleichen Zeit gelesen wie in brain/routes.ts. */
  const currentRoot = async (): Promise<string | null> => {
    const configured = options.brainRoot !== undefined ? options.brainRoot : brainRootFor(null);
    if (!configured) return null;
    const resolved = await resolveBrainRoot(configured);
    return resolved.available ? resolved.root : null;
  };

  // GET /api/v06/spark/overview/:companyId
  router.get("/overview/:companyId", async (c) => {
    const companyId = c.req.param("companyId");
    if (!companyId?.trim()) return c.json({ error: "Company-ID fehlt." }, 400);
    const root = await currentRoot();
    if (!root) {
      return c.json({
        companyId,
        clusters: [],
        links: [],
        available: false,
        reason: "Brain ist auf diesem Server nicht eingerichtet.",
        totalNotes: 0,
      });
    }
    try {
      return c.json(await buildCompanyStructureOverview(root, { companyId }));
    } catch (error) {
      console.error(JSON.stringify({ type: "spark-overview-build-failed", error: String(error) }));
      return c.json({ error: "Übersicht konnte nicht erstellt werden." }, 500);
    }
  });

  // GET /api/v06/spark/agent-access/:agentId
  router.get("/agent-access/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    if (!agentId?.trim()) return c.json({ error: "Agent-ID fehlt." }, 400);
    const root = options.brainRoot !== undefined ? options.brainRoot : brainRootFor(null);
    try {
      return c.json(await agentDataAccess(agentId, { rootOverride: root }));
    } catch (error) {
      console.error(JSON.stringify({ type: "agent-access-build-failed", error: String(error) }));
      return c.json({ error: "Datenzugriff konnte nicht erstellt werden." }, 500);
    }
  });

  return router;
}

/**
 * Registriert beide v06-Endpunkte auf der Haupt-App (Exporter für den
 * Integrations-Agenten, wie registerSparkMcpRoutes aus A08).
 *
 * Verwende: `registerSparkOverviewRoutes(app, { requireUser, database })` in
 * `createApp` von `apps/server/src/app.ts` (Wiring siehe Bericht A17).
 */
export function registerSparkOverviewRoutes(
  app: HonoApp<any, any, any>,
  options: SparkOverviewRouteOptions & { database?: unknown } = {},
): void {
  const router = createSparkOverviewRouter({ requireUser: options.requireUser });
  // Präfix /api/v06/spark, Unterwege wie im API-Vertrag (API_PATHS_V06.sparkOverviewPattern).
  app.route("/api/v06/spark", router);
}

/** Cluster-Id zu einem Notiz-Pfad: für Endpunkte, die ein Cluster wieder aufmachen. */
export { clusterIdOf, folderOf };

export default registerSparkOverviewRoutes;

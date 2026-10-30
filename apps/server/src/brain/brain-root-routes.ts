/**
 * Agent 2 – „Einstellungen – Daten-Pfad des Spark-Brain-Vaults änderbar“ (Helium, 2026-10-23).
 *
 * Drei Endpunkte neben dem bestehenden `/api/brain/location`:
 *
 *   GET  /api/brain/root            → { path, vaultPath, exists, writable, noteCount, source }
 *   POST /api/brain/root/validate   { path, create? }           → Prüfergebnis
 *   POST /api/brain/root            { path, mode, create? }     → umstellen
 *
 * `mode` ist „use“ (nur umstellen, alter Ordner bleibt unverändert) oder
 * „copy“ (Inhalte erst in den neuen Ordner kopieren, dann umstellen).
 * „move“ wird bewusst abgelehnt – es wird nie im alten Ordner aufgeräumt.
 *
 * Speicherort bleibt `%LOCALAPPDATA%\ConnectApp\data\connect.env`
 * (eine Quelle der Wahrheit – je Absprache 23.10.2026 kein brain-root.json).
 *
 * Registrierung (Agent 3, zentrale Datei apps/server/src/app.ts, daneben Zeile
 * `app.route("/api/brain", createBrainRoutes(requireUser));` einfügen):
 *
 *   import { createBrainRootRoutes } from "./brain/brain-root-routes";
 *   app.route("/api/brain", createBrainRootRoutes(requireUser));
 *
 * (Sicherungsdateien *.bak-helium-brain-pfad-<datum> von app.ts vorher anlegen.)
 */

import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../auth/guards";
import type { Database } from "../db/client";
import { recordMcpAuditLog } from "../connect-mcp/grants";
import {
  brainLocation,
  brainRootFor,
  brainRootFromEnv,
  BrainPathError,
  listAllMarkdown,
  resolveBrainRoot,
} from "./store";
import {
  countMarkdownNotes,
  getBrainRoot,
  setBrainRoot,
  validateBrainRoot,
  type BrainRootProbe,
  type BrainRootSwitchMode,
} from "./brain-root";

/**
 * Die Einstellungen gelten nur für den PC, auf dem der Ordner liegt: Host muss
 * loopback heißen (DNS-Rebinding-Gefahr), ein gesendeter Origin ebenfalls, und
 * wo die Runtime die Absender-IP kennt, muss auch sie loopback sein – sonst
 * könnte jemand aus dem Netz die Ordnerwahl des PCs umleiten. Angemeldet sein muss man
 * zusätzlich (`requireUser` läuft vor dieser Middleware).
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK_IP = /^(127\.|::1$|::ffff:127\.)/;

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const localOnly: MiddlewareHandler = async (context, next) => {
  const host = hostnameOf(context.req.header("host"));
  if (!host || !LOOPBACK_HOSTS.has(host)) {
    return context.json({ error: "Die Brain-Einstellungen sind nur lokal am PC erreichbar." }, 403);
  }
  const origin = context.req.header("origin");
  if (origin && origin !== "null") {
    const originHost = hostnameOf(origin);
    if (!originHost || !LOOPBACK_HOSTS.has(originHost)) {
      return context.json({ error: "Die Brain-Einstellungen sind nur lokal am PC erreichbar." }, 403);
    }
  }
  const server = (context.env as { server?: { requestIP?: (r: Request) => { address: string } | null } } | undefined)?.server;
  const address = server?.requestIP?.(context.req.raw)?.address;
  if (address && !LOOPBACK_IP.test(address)) {
    return context.json({ error: "Die Brain-Einstellungen sind nur lokal am PC erreichbar." }, 403);
  }
  await next();
};

/** Audit-Log-Treffer ablegen – Scheitern des Logs darf den Vorgang nicht brechen. */
async function auditRootChange(
  database: Database | undefined,
  grantId: string | null,
  toolName: string,
  params: Record<string, unknown>,
  status: "success" | "denied" | "error",
  detail?: string,
): Promise<void> {
  if (!database) return;
  try {
    await recordMcpAuditLog(database, {
      grantId,
      agentName: "connect-settings",
      toolName,
      paramsSummary: JSON.stringify(params).slice(0, 500),
      status,
      statusDetail: detail ?? null,
      ipAddress: "127.0.0.1",
    });
  } catch {
    // Nicht-blockierend: Ein Ausfall des Audit-Log-Writings soll die Umstellung
    // am PC nicht scheitern lassen.
  }
}

export function createBrainRootRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  configuredRoot: string | null = brainRootFromEnv(),
  database?: Database,
) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", requireUser);
  app.use("*", localOnly);

  /* Der Pfad in Kraft: pro Request gelesen, damit eine Änderung ohne Neustart wirkt. */
  const currentBrain = () => resolveBrainRoot(brainRootFor(configuredRoot));

  /**
   * GET /root: Was die Einstellungsseite anzeigt.
   * `noteCount` zählt alle Notizen, die die Brain-Ansicht zeigt (Brain + Vault).
   */
  app.get("/root", async (context) => {
    const location = getBrainRoot(configuredRoot);
    const brain = await currentBrain();
    if (!brain.available) {
      return context.json({
        path: location.path,
        vaultPath: location.vaultPath,
        exists: false,
        writable: false,
        noteCount: null,
        source: location.source,
        reason: brain.reason,
      });
    }
    let writable = false;
    try {
      const probe = validateBrainRoot(brain.root);
      writable = probe.writable;
    } catch {
      writable = false;
    }
    return context.json({
      path: location.path ?? brain.root,
      vaultPath: location.vaultPath,
      exists: true,
      writable,
      noteCount: (await listAllMarkdown(brain.root)).length,
      source: location.source,
    });
  });

  /** POST /root/validate: Das Ergebnis hinter dem „Prüfen“-Button. */
  app.post("/root/validate", async (context) => {
    if (!(context.req.header("content-type") ?? "").includes("application/json")) {
      return context.json({ error: "JSON erwartet." }, 415);
    }
    const body = (await context.req.json().catch(() => null)) as
      | { path?: unknown; create?: unknown; vaultPath?: unknown }
      | null;
    if (!body || (typeof body.path !== "string" && typeof body.vaultPath !== "string")) {
      return context.json({ error: "Pfad fehlt – bitte einen Ordner eintragen." }, 400);
    }
    if (typeof body.path === "string" && !body.path.trim()) {
      return context.json({ error: "Pfad fehlt – bitte einen Ordner eintragen." }, 400);
    }

    const create = body.create === true;
    let probe: BrainRootProbe | null = null;
    if (typeof body.path === "string" && body.path.trim().length > 0) {
      try {
        probe = validateBrainRoot(body.path, { create: false });
        if (create && !probe.exists && probe.canCreate) {
          probe = validateBrainRoot(body.path, { create: true });
        }
      } catch (error) {
        if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
        throw error;
      }
    }

    let vaultProbe: BrainRootProbe | null = null;
    if (typeof body.vaultPath === "string" && body.vaultPath.trim().length > 0) {
      try {
        vaultProbe = validateBrainRoot(body.vaultPath, { create: false });
        if (create && !vaultProbe.exists && vaultProbe.canCreate) {
          vaultProbe = validateBrainRoot(body.vaultPath, { create: true });
        }
      } catch (error) {
        if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
        throw error;
      }
    }

    const mainProbe = probe ?? vaultProbe!;
    await auditRootChange(
      database,
      context.req.header("x-grant-id") ?? null,
      "brain.root.validate",
      { path: probe?.path ?? null, vaultPath: vaultProbe?.path ?? null, create },
      mainProbe.valid ? "success" : "denied",
      mainProbe.problem ?? undefined,
    );

    return context.json({
      ...(probe ?? {}),
      vaultProbe,
      noteCount: probe?.exists && probe.path ? countMarkdownNotes(probe.path) : null,
    });
  });

  /**
   * POST /root: Umstellen – „use“ oder „copy“.
   *
   * Beim Scheitern wird der bisherige Stand nie verlassen:
   * Der alte Ordner wird bei „use“ nie angerührt; bei „copy“ wird der neu
   * geschriebene Inhalt aus dem Zielordner entfernt, wenn das Kopieren
   * vor dem Umstellen schiefging.
   *
   * Unterstützt SSE-Streaming (Accept: text/event-stream oder ?stream=1) für
   * echten Fortschritt beim Kopieren.
   */
  app.post("/root", async (context) => {
    if (!(context.req.header("content-type") ?? "").includes("application/json")) {
      return context.json({ error: "JSON erwartet." }, 415);
    }
    const body = (await context.req.json().catch(() => null)) as
      | { path?: unknown; vaultPath?: unknown; mode?: unknown; create?: unknown }
      | null;
    if (!body || typeof body.path !== "string" || !body.path.trim()) {
      return context.json({ error: "Pfad fehlt." }, 400);
    }

    const grantId = context.req.header("x-grant-id") ?? null;
    const mode: BrainRootSwitchMode = body.mode === "copy" ? "copy" : body.mode === "use" ? "use" : "move";
    const acceptsStream =
      (context.req.header("accept") ?? "").includes("text/event-stream") ||
      context.req.query("stream") === "1" ||
      context.req.query("stream") === "true";

    // Streaming für echten Kopier-Fortschritt an der Oberfläche
    if (acceptsStream && mode === "copy") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const result = await setBrainRoot(body.path, mode, {
              create: body.create === true,
              vaultPath: typeof body.vaultPath === "string" ? body.vaultPath : undefined,
              onProgress: (done, total, current) => {
                const percent = total > 0 ? Math.round((done / total) * 100) : 0;
                controller.enqueue(
                  encoder.encode(
                    `event: progress\ndata: ${JSON.stringify({ done, total, current, percent })}\n\n`,
                  ),
                );
              },
            });
            await auditRootChange(
              database,
              grantId,
              "brain.root.switch",
              { mode, path: result.path, vaultPath: result.vaultPath, copiedFiles: result.copiedFiles ?? null },
              "success",
            );
            controller.enqueue(
              encoder.encode(`event: done\ndata: ${JSON.stringify({ ok: true, ...result })}\n\n`),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await auditRootChange(
              database,
              grantId,
              "brain.root.switch",
              { mode, path: typeof body.path === "string" ? body.path : null },
              error instanceof BrainPathError ? "denied" : "error",
              message,
            );
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`),
            );
          } finally {
            try {
              controller.close();
            } catch {}
          }
        },
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          "connection": "keep-alive",
        },
      });
    }

    try {
      const result = await setBrainRoot(body.path, mode, {
        create: body.create === true,
        vaultPath: typeof body.vaultPath === "string" ? body.vaultPath : undefined,
      });
      await auditRootChange(
        database,
        grantId,
        "brain.root.switch",
        { mode, path: result.path, vaultPath: result.vaultPath, copiedFiles: result.copiedFiles ?? null },
        "success",
      );
      return context.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof BrainPathError) {
        await auditRootChange(
          database,
          grantId,
          "brain.root.switch",
          { mode, path: typeof body.path === "string" ? body.path : null },
          "denied",
          error.message,
        );
        return context.json({ error: error.message }, 400);
      }
      await auditRootChange(
        database,
        grantId,
        "brain.root.switch",
        { mode, path: typeof body.path === "string" ? body.path : null },
        "error",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });

  return app;
}

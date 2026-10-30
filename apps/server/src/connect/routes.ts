import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import type { Database } from "../db/client";
import { connectMedia, connectWorkspaceKv } from "../db/schema";
import { decodeWorkspaceValue, mergeWorkspaceValue, sameWorkspaceValue, type MergeConflict } from "./workspace-merge";
import { mintT3PairingLink, t3AgentsStatus } from "./t3-agents";
import { cdpGlideCursor, injectAgentVisuals, waitForCdp } from "../agent-hub/agent-cdp";
import {
  canonicalCdpPort,
  ensureProfileBrowser,
  liveCdpPort,
  openUrlInProfileTab,
  resolveProfileCdp,
} from "../agent-hub/browser-launch-guard";

const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const DEPLOYMENT_MODE_KEY = "connect.deployment-mode";
const GLOBAL_KEYS = new Set([DEPLOYMENT_MODE_KEY]);
/** Siehe cloud-agents/store.ts — diese Zeilen sind nie Teil eines Workspaces. */
const SERVER_ONLY_PREFIX = "server:";

/**
 * Bun's SQL binder sends JS numbers as Postgres integers. jsonb columns need an
 * explicit cast or inserts like `connect.activeLevel: 1` fail with 42804.
 */
function asJsonb(value: unknown) {
  return sql`${JSON.stringify(value ?? null)}::jsonb`;
}

function userKeyPrefix(userId: string) {
  return `u:${userId}:`;
}

function toUserKey(userId: string, key: string) {
  if (GLOBAL_KEYS.has(key) || key.startsWith("u:")) return key;
  return `${userKeyPrefix(userId)}${key}`;
}

function fromUserKey(userId: string, storedKey: string): string | null {
  const prefix = userKeyPrefix(userId);
  if (storedKey.startsWith(prefix)) return storedKey.slice(prefix.length);
  return null;
}

/**
 * Persist Connect logos, banners, avatars and workspace JSON in Postgres /
 * Supabase. Workspace keys are scoped per signed-in account
 * (`u:{userId}:connect.…`) so Lab tab groups follow name + Google login.
 */
export function createConnectWorkspaceRoutes(
  database: Database,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", requireUser);

  app.get("/deployment-mode", async (context) => {
    const [row] = await database
      .select()
      .from(connectWorkspaceKv)
      .where(eq(connectWorkspaceKv.key, DEPLOYMENT_MODE_KEY))
      .limit(1);
    const raw = row?.value as { mode?: string; cloudUrl?: string } | null;
    const mode = raw?.mode === "cloud" ? "cloud" : "local";
    return context.json({
      mode,
      cloudUrl: typeof raw?.cloudUrl === "string" ? raw.cloudUrl : undefined,
      /**
       * Local keeps all workspace data on this machine / private network.
       * Cloud is opt-in for teams that accept a hosted Supabase project.
       */
      options: {
        local: {
          label: "Lokal",
          summary:
            "Daten bleiben auf eurem Server / PC. Kein Cloud-Sync — für Unternehmen mit strengen Datenschutz-Anforderungen.",
        },
        cloud: {
          label: "Cloud",
          summary:
            "Supabase Cloud — Lab-Tabgruppen, Companies und Profil unter deinem Account, geräteübergreifend, Google-Login.",
        },
      },
    });
  });

  app.put("/deployment-mode", async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      mode?: unknown;
      cloudUrl?: unknown;
    } | null;
    const mode = body?.mode === "cloud" ? "cloud" : "local";
    const cloudUrl =
      typeof body?.cloudUrl === "string" ? body.cloudUrl.trim() : "";
    if (mode === "cloud" && !cloudUrl) {
      return context.json(
        {
          error:
            "Für Cloud bitte die Supabase-Projekt-URL angeben (https://….supabase.co).",
        },
        400,
      );
    }
    const now = new Date();
    const value = {
      mode,
      ...(mode === "cloud" && cloudUrl ? { cloudUrl } : {}),
      updatedAt: now.toISOString(),
    };
    await database
      .insert(connectWorkspaceKv)
      .values({
        key: DEPLOYMENT_MODE_KEY,
        value: asJsonb(value),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: connectWorkspaceKv.key,
        set: { value: asJsonb(value), updatedAt: now },
      });
    return context.json({ ok: true, mode, cloudUrl: cloudUrl || undefined });
  });

  app.get("/workspace", async (context) => {
    const actor = context.get("actor");
    const rows = await database.select().from(connectWorkspaceKv);
    const workspace: Record<string, unknown> = {};
    let hasUserScoped = false;
    for (const row of rows) {
      const logical = fromUserKey(actor.id, row.key);
      if (logical) {
        workspace[logical] = row.value;
        hasUserScoped = true;
      }
    }
    // One-time migrate: legacy global keys → this account (skip deployment-mode).
    if (!hasUserScoped) {
      const now = new Date();
      for (const row of rows) {
        if (
          GLOBAL_KEYS.has(row.key) ||
          row.key.startsWith("u:") ||
          // Server-interne Zeilen (z. B. verschlüsselte Cloud-Agent-Keys) gehen nie an den Browser.
          row.key.startsWith(SERVER_ONLY_PREFIX)
        )
          continue;
        workspace[row.key] = row.value;
        await database
          .insert(connectWorkspaceKv)
          .values({
            key: toUserKey(actor.id, row.key),
            value: asJsonb(row.value),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: connectWorkspaceKv.key,
            set: { value: asJsonb(row.value), updatedAt: now },
          });
      }
    }
    workspace["connect.account"] = {
      userId: actor.id,
      email: actor.email,
      name: actor.name ?? null,
    };
    return context.json({ workspace });
  });

  app.put("/workspace", async (context) => {
    const actor = context.get("actor");
    const body = (await context.req.json().catch(() => null)) as {
      workspace?: Record<string, unknown>;
      bases?: Record<string, unknown>;
    } | null;
    if (!body?.workspace || typeof body.workspace !== "object") {
      return context.json({ error: "workspace object required" }, 400);
    }
    // Merge, never overwrite: every key is three-way merged against the base the client last saw
    // (no base -> additive union), so a stale tab or a second device cannot drop newer data.
    const bases = body.bases && typeof body.bases === "object" ? body.bases : {};
    const now = new Date();
    const account = { userId: actor.id, email: actor.email, name: actor.name ?? null };
    const merged: Record<string, unknown> = {};
    const conflicts: Array<{ key: string; at: string; conflicts: MergeConflict[] }> = [];
    await database.transaction(async (tx) => {
      const entries: Array<[string, unknown]> = Object.entries(body.workspace as Record<string, unknown>).filter(
        ([key]) => typeof key === "string" && !!key.trim() && !GLOBAL_KEYS.has(key) && key !== "connect.account",
      );
      entries.push(["connect.account", account]);
      for (const [key, incoming] of entries) {
        const storedKey = toUserKey(actor.id, key);
        const [row] = await tx
          .select()
          .from(connectWorkspaceKv)
          .where(eq(connectWorkspaceKv.key, storedKey))
          .for("update")
          .limit(1);
        let next: unknown = decodeWorkspaceValue(incoming);
        if (key === "connect.account") {
          const prev = row ? (decodeWorkspaceValue(row.value) as Record<string, unknown> | null) : null;
          const same =
            !!prev && prev.userId === account.userId && prev.email === account.email && (prev.name ?? null) === account.name;
          next = same ? prev : { ...account, updatedAt: now.toISOString() };
        } else if (row) {
          const result = mergeWorkspaceValue(
            Object.prototype.hasOwnProperty.call(bases, key) ? bases[key] : undefined,
            row.value,
            incoming,
          );
          next = result.value;
          if (result.conflicts.length) conflicts.push({ key, at: now.toISOString(), conflicts: result.conflicts });
        }
        merged[key] = next;
        if (row && sameWorkspaceValue(row.value, next)) continue;
        await tx
          .insert(connectWorkspaceKv)
          .values({ key: storedKey, value: asJsonb(next), updatedAt: now })
          .onConflictDoUpdate({ target: connectWorkspaceKv.key, set: { value: asJsonb(next), updatedAt: now } });
      }
      if (conflicts.length) {
        const logKey = toUserKey(actor.id, "connect.sync-conflicts");
        const [logRow] = await tx
          .select()
          .from(connectWorkspaceKv)
          .where(eq(connectWorkspaceKv.key, logKey))
          .for("update")
          .limit(1);
        const previous = logRow ? decodeWorkspaceValue(logRow.value) : [];
        const log = [...(Array.isArray(previous) ? previous : []), ...conflicts].slice(-200);
        await tx
          .insert(connectWorkspaceKv)
          .values({ key: logKey, value: asJsonb(log), updatedAt: now })
          .onConflictDoUpdate({ target: connectWorkspaceKv.key, set: { value: asJsonb(log), updatedAt: now } });
      }
    });
    return context.json({
      ok: true,
      account: { userId: actor.id, email: actor.email, name: actor.name },
      workspace: merged,
      conflicts: conflicts.length,
    });
  });

  /** Status of the local App <-> Supabase sync task (sync-engine), for Einstellungen > Sicherung. */
  app.get("/sync-status", async (context) => {
    const file =
      process.env.CONNECT_SYNC_STATUS_FILE ||
      (process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\ConnectApp\\data\\sbsync\\status.json` : "");
    if (!file) return context.json({ available: false });
    try {
      const text = await Bun.file(file).text();
      return context.json({ available: true, ...(JSON.parse(text.replace(/^\uFEFF/, "")) as Record<string, unknown>) });
    } catch {
      return context.json({ available: false });
    }
  });

  app.get("/media/:id", async (context) => {
    const id = context.req.param("id");
    const [row] = await database
      .select()
      .from(connectMedia)
      .where(eq(connectMedia.id, id))
      .limit(1);
    if (!row) return context.json({ error: "Not found" }, 404);
    return new Response(new Uint8Array(row.bytes), {
      status: 200,
      headers: {
        "content-type": row.mime,
        "cache-control": "public, max-age=31536000, immutable",
        "content-length": String(row.byteLength),
      },
    });
  });

  app.post("/media", async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      dataUrl?: string;
      id?: string;
    } | null;
    const dataUrl = body?.dataUrl;
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return context.json({ error: "dataUrl required" }, 400);
    }
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) {
      return context.json({ error: "Only base64 data URLs are accepted" }, 400);
    }
    const mime = match[1] || "application/octet-stream";
    let bytes: Buffer;
    try {
      bytes = Buffer.from(match[2], "base64");
    } catch {
      return context.json({ error: "Invalid base64" }, 400);
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_BYTES) {
      return context.json(
        {
          error:
            bytes.byteLength === 0
              ? "Das Bild ist leer."
              : `Das Bild ist zu groß (max. ${Math.round(MAX_MEDIA_BYTES / (1024 * 1024))} MB). Bitte ein kleineres Bild wählen.`,
        },
        413,
      );
    }
    const id =
      (typeof body?.id === "string" && body.id.trim()) ||
      `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    await database
      .insert(connectMedia)
      .values({
        id,
        mime,
        bytes,
        byteLength: bytes.byteLength,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: connectMedia.id,
        set: {
          mime,
          bytes,
          byteLength: bytes.byteLength,
          updatedAt: now,
        },
      });
    return context.json({ id, url: `/api/connect/media/${id}`, mime });
  });

  /**
   * Open a URL in the host's Google Chrome / Edge with a dedicated Connect
   * profile (extensions / Web Store). No system-browser fallback — callers
   * must show Connect Desktop when this fails (needsDesktop: true).
   */
  /**
   * Profilmenü › Connect-Chrome: Browser-Tab-Agenten einschalten. Ist kein Browser mit Connect Sync
   * verbunden, startet Connect-Chrome (eigenes Connect-Profil, nicht Stefans Helium) mit der Erweiterung.
   */
  app.get("/browser-agents", async (context) => {
    const { agentsEnabled, heliumStatus } = await import("../helium-sync");
    return context.json({ agentsEnabled: agentsEnabled(), ...heliumStatus() });
  });
  /**
   * Agents — T3 Code. Status of the local T3 server, for the Agents area.
   * Reads T3's runtime file and probes the origin; never returns its secrets.
   */
  app.get("/agents/t3", async (context) =>
    context.json(
      await t3AgentsStatus({ preferHost: context.req.header("host") }),
    ),
  );

  /**
   * Agents — mint a one-time T3 pairing link.
   *
   * The browser embeds T3's own web app, which expects a trusted pairing
   * credential on first open. The link is minted by T3's CLI and handed to the
   * browser in the iframe URL; Connect never stores the token.
   */
  app.post("/agents/t3/pair", async (context) => {
    if (process.env.CONNECT_SERVERLESS === "1") {
      return context.json(
        { ok: false, error: "Nur in der Connect App am PC." },
        400,
      );
    }
    const result = await mintT3PairingLink({
      preferHost: context.req.header("host"),
    });
    return context.json(result, result.ok ? 200 : 502);
  });

  app.post("/browser-agents", async (context) => {
    if (process.env.CONNECT_SERVERLESS === "1") return context.json({ ok: false, error: "Nur in der Connect App am PC." }, 400);
    const actor = context.get("actor");
    const body = (await context.req.json().catch(() => null)) as { enabled?: unknown; launch?: unknown } | null;
    const { agentsEnabled, setAgentsEnabled, extensionLive, heliumStatus } = await import("../helium-sync");
    setAgentsEnabled(body?.enabled !== false);
    let launched: { ok: boolean; detail?: string } | null = null;
    if (agentsEnabled() && !extensionLive() && body?.launch !== false) {
      const { profileDir } = connectChromeProfileDir(actor.id, "", "default");
      launched = await launchConnectChrome("about:blank", profileDir);
      for (let i = 0; i < 20 && !extensionLive(); i++) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return context.json({ ok: true, agentsEnabled: agentsEnabled(), launched: launched?.ok ?? false, launchError: launched && !launched.ok ? launched.detail ?? null : null, ...heliumStatus() });
  });

  app.post("/open-chrome", async (context) => {
    const actor = context.get("actor");
    const body = (await context.req.json().catch(() => null)) as {
      url?: unknown;
      agentId?: unknown;
      /** `manus` = dedicated per-bot Manus profile (Plan 050) — never shared. */
      profileKind?: unknown;
    } | null;
    const raw = typeof body?.url === "string" ? body.url.trim() : "";
    // about:blank allowed for warming an agent Chrome profile
    if (!raw || (!/^https?:\/\//i.test(raw) && raw !== "about:blank")) {
      return context.json({ ok: false, error: "URL fehlt oder ungültig." }, 400);
    }
    const agentRaw =
      typeof body?.agentId === "string" ? body.agentId.trim() : "";
    const profileKind =
      body?.profileKind === "manus" ? "manus" : "default";
    const { profileDir, safeAgent } = connectChromeProfileDir(
      actor.id,
      agentRaw,
      profileKind,
    );

    const launched = await launchConnectChrome(raw, profileDir);
    if (launched.ok) {
      return context.json({
        ok: true,
        profile: profileDir,
        profileKind,
        account: actor.email,
        agentId: safeAgent || undefined,
        binary: launched.binary,
      });
    }

    return context.json(
      {
        ok: false,
        needsDesktop: true,
        error:
          "Connect Desktop nötig — Connect ist der Browser (Host-Chrome mit Profil). Starte Connect.exe oder ./START-APP.sh auf dem PC — nicht als Website im Web-Tab. Bot-Computer :4100 ist nur Ubuntu-Sandbox.",
        detail: launched.detail,
      },
      503,
    );
  });

  /**
   * Model One / Two status — never returns raw secrets (Plan 047).
   * hasManusKey from env only on server; client also tracks Settings store.
   */
  app.get("/provider-status", async (context) => {
    const hasManusKey = Boolean(
      process.env.MANUS_API_KEY?.trim() ||
        process.env.VITE_MANUS_API_KEY?.trim(),
    );
    const hasCodexBridge = Boolean(
      process.env.CONNECT_CODEX_BRIDGE_TOKEN?.trim() ||
        process.env.CONNECT_CODEX_API_KEY?.trim() ||
        process.env.CODEX_API_KEY?.trim(),
    );
    return context.json({
      provider: "unknown",
      hasManusKey,
      hasCodexBridge,
      manusFeaturesEnabled: hasManusKey,
      hint:
        "Client Model Provider (Settings) decides hermes|external. Manus features need a stored key.",
    });
  });

  /**
   * Model One chat router (server-side). Client still routes via model-provider-dispatch;
   * this endpoint supports Desktop headless Codex / Manus when invoked with provider hints.
   */
  app.post("/model-chat", async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      provider?: unknown;
      path?: unknown;
      text?: unknown;
      files?: unknown;
      agentId?: unknown;
      flavor?: unknown;
    } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return context.json({ ok: false, text: "Leere Nachricht." }, 400);
    }
    const provider =
      body?.provider === "hermes" || body?.provider === "external"
        ? body.provider
        : "external";
    const path =
      body?.path === "terminal" || body?.path === "api_key"
        ? body.path
        : "api_key";
    const files = Array.isArray(body?.files)
      ? body.files.filter((f): f is string => typeof f === "string")
      : [];

    if (provider === "hermes") {
      return context.json({
        ok: true,
        useHermes: true,
        text:
          "Routed to Hermes (Model Two) — client uses AG-UI at agent-bot /ag-ui (default :4100).",
      });
    }

    if (path === "api_key") {
      const apiKey =
        process.env.MANUS_API_KEY?.trim() ||
        process.env.VITE_MANUS_API_KEY?.trim() ||
        "";
      if (!apiKey) {
        return context.json(
          {
            ok: false,
            text:
              "Kein Manus-API-Key auf dem Server (MANUS_API_KEY). Settings-Key wird clientseitig über /api/manus genutzt.",
            hasManusKey: false,
          },
          503,
        );
      }
      try {
        const res = await fetch("https://api.manus.ai/v2/task.create", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-manus-api-key": apiKey,
          },
          body: JSON.stringify({ message: { content: text } }),
        });
        const payload = (await res.json().catch(() => null)) as {
          ok?: boolean;
          task_id?: string;
          task_url?: string;
          error?: { message?: string };
        } | null;
        if (!res.ok || payload?.ok === false) {
          return context.json(
            {
              ok: false,
              hasManusKey: true,
              text:
                payload?.error?.message?.trim() ||
                `Manus API Fehler ${res.status}`,
            },
            502,
          );
        }
        return context.json({
          ok: true,
          hasManusKey: true,
          taskId: payload?.task_id,
          taskUrl: payload?.task_url,
          text: `Manus-Task gestartet${payload?.task_url ? `: ${payload.task_url}` : "."}`,
        });
      } catch (err) {
        return context.json(
          {
            ok: false,
            hasManusKey: true,
            text:
              err instanceof Error
                ? err.message
                : "Manus API nicht erreichbar.",
          },
          502,
        );
      }
    }

    // Terminal path — try headless Invoke-Codex.ps1 (Windows Desktop), else cli-bridge.
    const codex = await runHeadlessInvokeCodex(text, files);
    if (codex.ran) {
      return context.json({
        ok: codex.ok,
        path: "terminal",
        via: "Invoke-Codex.ps1",
        text: codex.text,
        files,
      });
    }

    return context.json({
      ok: true,
      path: "terminal",
      useCliBridge: true,
      skipped: true,
      text:
        "Kein Invoke-Codex.ps1 auf diesem Host — Client nutzt /api/cli-bridge (unsichtbar).",
      files,
    });
  });

  /**
   * Android phone host — adb + optional scrcpy for agent smartphone control.
   * Open-source: Android Platform Tools + Genymobile/scrcpy.
   */
  app.get("/phone/status", async (context) => {
    const status = await probePhoneHost();
    return context.json(status);
  });

  app.get("/phone/screenshot", async (context) => {
    const serialParam = context.req.query("serial")?.trim() || undefined;
    const shot = await capturePhoneScreenshot(serialParam);
    if (!shot.ok) {
      return context.json(
        { ok: false, error: shot.error, serial: shot.serial },
        503,
      );
    }
    return context.json({
      ok: true,
      dataUrl: shot.dataUrl,
      serial: shot.serial,
    });
  });

  app.post("/phone/connect", async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      host?: unknown;
    } | null;
    const host =
      typeof body?.host === "string" ? body.host.trim() : "";
    if (!host || !/^[\w.\[\]:%]+$/.test(host)) {
      return context.json(
        { ok: false, message: "Ungültiger Host (erwartet IP:Port)." },
        400,
      );
    }
    const result = await adbConnect(host);
    return context.json(result, result.ok ? 200 : 503);
  });

  /**
   * Live preview of an agent's own Chrome/Helium profile over CDP (localhost only).
   * The browser is started by /open-chrome with --remote-debugging-port (see cdpPortFor).
   */
  app.get("/agent-chrome/screenshot", async (context) => {
    const actor = context.get("actor");
    const agentId = context.req.query("agentId")?.trim() ?? "";
    const kind = context.req.query("profileKind") === "manus" ? "manus" : "default";
    const targetId = context.req.query("targetId")?.trim() || undefined;
    const { profileDir } = connectChromeProfileDir(actor.id, agentId, kind);
    // loopfix: echten Port der laufenden Instanz verwenden (DevToolsActivePort / Kommandozeile).
    // Früher: fester Port zu, also bei JEDEM Poll (~850 ms) neu gestartet => Chrome reichte den
    // Start an die laufende Instanz weiter => ein neues about:blank-Fenster pro Poll.
    // Jetzt: Start nur über den Guard (1 Start/15 s, Schutzschalter), nie bei laufender Instanz.
    const guarded = await ensureProfileBrowser(profileDir, {
      label: "Agent-Browser",
      spawn: (p) => spawnConnectChromeRaw("about:blank", profileDir, p),
      waitMs: 3500,
    });
    if (!guarded.ok) {
      return context.json(
        {
          ok: false,
          needsDesktop: false,
          stopped: Boolean(guarded.tripped || guarded.running),
          error: guarded.error,
        },
        503,
      );
    }
    const port = guarded.port;
    const shot = await cdpScreenshot(port, targetId);
    if (!shot.ok || !shot.bytes) {
      return context.json({ ok: false, error: shot.error ?? "Keine Vorschau." }, 503);
    }
    return new Response(shot.bytes as unknown as BodyInit, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "no-store",
        "x-connect-page-url": encodeURI(shot.url ?? ""),
      },
    });
  });

  /** List only page targets from this agent's isolated Chrome profile. */
  app.get("/agent-chrome/tabs", async (context) => {
    const actor = context.get("actor");
    const agentId = context.req.query("agentId")?.trim() ?? "";
    const kind = context.req.query("profileKind") === "manus" ? "manus" : "default";
    const { profileDir } = connectChromeProfileDir(actor.id, agentId, kind);
    // loopfix: nie selbst starten (das macht höchstens /screenshot über den Guard).
    const live = await resolveProfileCdp(profileDir);
    if (!live.port) {
      return context.json({ ok: false, error: live.running ? "Agent-Browser läuft ohne erreichbaren Debug-Port." : "Agent-Browser nicht gestartet.", tabs: [] }, 503);
    }
    const port = live.port;
    try {
      const tabs = await cdpPageTargets(port);
      return context.json({
        ok: true,
        tabs: tabs.map(({ id, title, url }) => ({ id, title, url })),
      });
    } catch {
      return context.json({ ok: false, error: "Agent-Browser nicht erreichbar.", tabs: [] }, 503);
    }
  });

  /** Bring the agent's browser tab to the front (big view "Fenster zeigen"). */
  app.post("/agent-chrome/focus", async (context) => {
    const actor = context.get("actor");
    const body = (await context.req.json().catch(() => null)) as {
      agentId?: unknown;
      profileKind?: unknown;
      targetId?: unknown;
    } | null;
    const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
    const kind = body?.profileKind === "manus" ? "manus" : "default";
    const targetId = typeof body?.targetId === "string" ? body.targetId.trim() : undefined;
    const { profileDir } = connectChromeProfileDir(actor.id, agentId, kind);
    const res = await cdpCall(await liveCdpPort(profileDir), "Page.bringToFront", {}, targetId);
    return context.json(res.ok ? { ok: true } : { ok: false, error: res.error }, res.ok ? 200 : 503);
  });

  /** Explicit, structured input forwarding for the user-controlled agent browser view. */
  app.post("/agent-chrome/control", async (context) => {
    const actor = context.get("actor");
    const body = (await context.req.json().catch(() => null)) as {
      agentId?: unknown;
      profileKind?: unknown;
      targetId?: unknown;
      action?: unknown;
      x?: unknown;
      y?: unknown;
      button?: unknown;
      clickCount?: unknown;
      deltaX?: unknown;
      deltaY?: unknown;
      text?: unknown;
      key?: unknown;
      code?: unknown;
      modifiers?: unknown;
      url?: unknown;
    } | null;
    const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
    const targetId = typeof body?.targetId === "string" ? body.targetId.trim() : "";
    const kind = body?.profileKind === "manus" ? "manus" : "default";
    const action = body?.action;
    if (!agentId || !targetId || targetId.length > 128) {
      return context.json({ ok: false, error: "Agent oder Browser-Tab fehlt." }, 400);
    }
    const { profileDir } = connectChromeProfileDir(actor.id, agentId, kind);
    const port = await liveCdpPort(profileDir);

    if (action === "move") {
      const x = typeof body?.x === "number" ? body.x : NaN;
      const y = typeof body?.y === "number" ? body.y : NaN;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        return context.json({ ok: false, error: "Ungültige Zeigerposition." }, 400);
      }
      const metrics = await cdpCall(port, "Page.getLayoutMetrics", {}, targetId);
      const viewport = (metrics.result?.cssLayoutViewport ?? metrics.result?.layoutViewport) as
        | { clientWidth?: number; clientHeight?: number }
        | undefined;
      const width = Number(viewport?.clientWidth) || 1280;
      const height = Number(viewport?.clientHeight) || 800;
      const point = { x: Math.round(x * width), y: Math.round(y * height) };
      await cdpCall(port, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: point.x,
        y: point.y,
      }, targetId);
      void cdpCall(port, "Runtime.evaluate", {
        expression: `if (window.__updateCursor) window.__updateCursor(${point.x}, ${point.y});`,
      }, targetId).catch(() => undefined);
      return context.json({ ok: true });
    }

    if (action === "click" || action === "scroll") {
      const x = typeof body?.x === "number" ? body.x : NaN;
      const y = typeof body?.y === "number" ? body.y : NaN;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        return context.json({ ok: false, error: "Ungültige Zeigerposition." }, 400);
      }
      const metrics = await cdpCall(port, "Page.getLayoutMetrics", {}, targetId);
      const viewport = (metrics.result?.cssLayoutViewport ?? metrics.result?.layoutViewport) as
        | { clientWidth?: number; clientHeight?: number }
        | undefined;
      const width = Number(viewport?.clientWidth);
      const height = Number(viewport?.clientHeight);
      if (!metrics.ok || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return context.json({ ok: false, error: metrics.error ?? "Browser-Ansicht nicht verfügbar." }, 503);
      }
      const point = { x: x * width, y: y * height };
      if (action === "scroll") {
        const deltaX = typeof body?.deltaX === "number" ? body.deltaX : 0;
        const deltaY = typeof body?.deltaY === "number" ? body.deltaY : 0;
        if (Math.abs(deltaX) > 2000 || Math.abs(deltaY) > 2000) {
          return context.json({ ok: false, error: "Scroll-Schritt ist zu groß." }, 400);
        }
        const res = await cdpCall(port, "Input.dispatchMouseEvent", {
          type: "mouseWheel", ...point, deltaX, deltaY,
        }, targetId);
        return context.json(res.ok ? { ok: true } : { ok: false, error: res.error }, res.ok ? 200 : 503);
      }
      const button = body?.button === "right" || body?.button === "middle" ? body.button : "left";
      const clickCount = body?.clickCount === 2 ? 2 : 1;
      await cdpGlideCursor(port, point.x, point.y, true, 200, targetId);
      const pressed = await cdpCall(port, "Input.dispatchMouseEvent", {
        type: "mousePressed", ...point, button, clickCount,
        buttons: button === "left" ? 1 : button === "right" ? 2 : 4,
      }, targetId);
      if (!pressed.ok) return context.json({ ok: false, error: pressed.error }, 503);
      const released = await cdpCall(port, "Input.dispatchMouseEvent", {
        type: "mouseReleased", ...point, button, clickCount, buttons: 0,
      }, targetId);
      return context.json(released.ok ? { ok: true } : { ok: false, error: released.error }, released.ok ? 200 : 503);
    }

    if (action === "text") {
      const text = typeof body?.text === "string" ? body.text : "";
      if (!text || text.length > 1000) return context.json({ ok: false, error: "Text fehlt oder ist zu lang." }, 400);
      const res = await cdpCall(port, "Input.insertText", { text }, targetId);
      return context.json(res.ok ? { ok: true } : { ok: false, error: res.error }, res.ok ? 200 : 503);
    }

    if (action === "key") {
      const key = typeof body?.key === "string" ? body.key : "";
      const code = typeof body?.code === "string" ? body.code : "";
      const modifiers = typeof body?.modifiers === "number" ? body.modifiers : 0;
      const allowedKey = /^[a-zA-Z0-9]$/.test(key) || [
        "Enter", "Escape", "Tab", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "Home", "End", "PageUp", "PageDown", "Space", " ", "Shift", "Control", "Alt", "Meta",
      ].includes(key) || /^F(?:[1-9]|1[0-2])$/.test(key);
      if (!allowedKey || !Number.isInteger(modifiers) || modifiers < 0 || modifiers > 15 || code.length > 32) {
        return context.json({ ok: false, error: "Diese Taste wird nicht unterstützt." }, 400);
      }
      const virtualKey = /^[a-zA-Z]$/.test(key)
        ? key.toUpperCase().charCodeAt(0)
        : /^[0-9]$/.test(key)
          ? key.charCodeAt(0)
          : ({ Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, PageUp: 33, PageDown: 34, Space: 32, " ": 32, Shift: 16, Control: 17, Alt: 18, Meta: 91 } as Record<string, number>)[key] ?? (key.startsWith("F") ? 111 + Number(key.slice(1)) : 0);
      const params = { key: key === "Space" ? " " : key, code: code || key, modifiers, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey };
      const down = await cdpCall(port, "Input.dispatchKeyEvent", { type: "keyDown", ...params }, targetId);
      if (!down.ok) return context.json({ ok: false, error: down.error }, 503);
      const up = await cdpCall(port, "Input.dispatchKeyEvent", { type: "keyUp", ...params }, targetId);
      return context.json(up.ok ? { ok: true } : { ok: false, error: up.error }, up.ok ? 200 : 503);
    }

    if (action === "navigate") {
      const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
      let parsed: URL;
      try { parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`); }
      catch { return context.json({ ok: false, error: "Bitte eine gültige Webadresse eingeben." }, 400); }
      if (!(["http:", "https:"].includes(parsed.protocol) || parsed.href === "about:blank")) {
        return context.json({ ok: false, error: "Nur Webadressen mit http oder https sind erlaubt." }, 400);
      }
      const res = await cdpCall(port, "Page.navigate", { url: parsed.href }, targetId);
      return context.json(res.ok ? { ok: true } : { ok: false, error: res.error }, res.ok ? 200 : 503);
    }

    if (action === "reload") {
      const res = await cdpCall(port, "Page.reload", { ignoreCache: false }, targetId);
      return context.json(res.ok ? { ok: true } : { ok: false, error: res.error }, res.ok ? 200 : 503);
    }

    return context.json({ ok: false, error: "Unbekannte Browser-Aktion." }, 400);
  });

  return app;
}

/**
 * Profile directory for an agent's own browser. CONNECT_CHROME_PROFILE is the base (e.g. a
 * dedicated Helium profile folder), never the user's own browser profile.
 */
function connectChromeProfileDir(
  actorId: string,
  agentRaw: string,
  profileKind: "default" | "manus",
): { profileDir: string; safeAgent: string } {
  const safeUser = actorId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "default";
  const safeAgent = agentRaw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);

  // Phase E Schritt 18: Wenn für den Agenten ein isoliertes ConnectAgents-Profil existiert, nimm dieses
  if (safeAgent) {
    const localAppData =
      process.env.LOCALAPPDATA ??
      join(process.env.HOME ?? process.env.USERPROFILE ?? ".", "AppData", "Local");
    const agentHeliumDir = join(localAppData, "ConnectAgents", safeAgent, "helium");
    if (existsSync(agentHeliumDir)) {
      return { profileDir: agentHeliumDir, safeAgent };
    }
  }

  const base =
    process.env.CONNECT_CHROME_PROFILE?.trim() ||
    `${process.env.HOME || process.env.USERPROFILE || "/tmp"}/.connect-chrome-profile/${safeUser}`;
  // Dedicated Manus profile: …/agents/{agentId}/manus — isolated from
  // the general agent Chrome profile (one Manus login per email).
  const profileDir = safeAgent
    ? profileKind === "manus"
      ? `${base}/agents/${safeAgent}/manus`
      : `${base}/agents/${safeAgent}`
    : base;
  return { profileDir, safeAgent };
}

/** Deterministic CDP port per profile: CONNECT_CHROME_CDP_PORT (default 9333) + 0..199. */
// loopfix: gemeinsame Implementierung mit agent-cdp.ts (browser-launch-guard.ts).
function cdpPortFor(profileDir: string): number {
  return canonicalCdpPort(profileDir);
}

type CdpResult = { ok: boolean; result?: Record<string, unknown>; url?: string; error?: string };
type CdpShot = { ok: boolean; bytes?: Uint8Array; url?: string; error?: string };

type CdpTarget = { id?: string; type?: string; title?: string; url?: string; webSocketDebuggerUrl?: string };

async function cdpPageTargets(port: number): Promise<Array<{ id: string; title: string; url: string }>> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error("Agent-Browser nicht erreichbar.");
  const list = (await res.json()) as CdpTarget[];
  return list
    .filter((target): target is CdpTarget & { id: string } => Boolean(target.id && target.type === "page" && target.webSocketDebuggerUrl && !target.url?.startsWith("devtools://")))
    .map((target) => ({ id: target.id, title: target.title ?? target.url ?? "Neuer Tab", url: target.url ?? "about:blank" }));
}

async function cdpPageTarget(port: number, targetId?: string): Promise<CdpTarget | null> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) return null;
  const list = (await res.json()) as CdpTarget[];
  if (targetId) {
    return list.find((target) => target.id === targetId && target.type === "page" && target.webSocketDebuggerUrl) ?? null;
  }
  return (
    list.find((t) => t.type === "page" && t.webSocketDebuggerUrl && !t.url?.startsWith("devtools://")) ??
    null
  );
}

async function cdpCall(
  port: number,
  method: string,
  params: Record<string, unknown>,
  targetId?: string,
): Promise<CdpResult> {
  let target: CdpTarget | null = null;
  try {
    target = await cdpPageTarget(port, targetId);
  } catch {
    return { ok: false, error: `Agent-Browser nicht erreichbar (CDP 127.0.0.1:${port}).` };
  }
  if (!target?.webSocketDebuggerUrl) {
    return { ok: false, error: "Kein offener Tab im Agent-Browser." };
  }
  const wsUrl = target.webSocketDebuggerUrl;
  return await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      resolve({ ok: false, error: "CDP-Timeout." });
    }, 5000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: number;
          result?: Record<string, unknown>;
          error?: { message?: string };
        };
        if (msg.id !== 1) return;
        clearTimeout(timer);
        ws.close();
        resolve(
          msg.error
            ? { ok: false, error: msg.error.message ?? "CDP-Fehler" }
            : { ok: true, result: msg.result ?? {}, url: target?.url },
        );
      } catch {
        /* ignore non-JSON */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve({ ok: false, error: "CDP-Verbindung fehlgeschlagen." });
    };
  });
}

async function cdpScreenshot(
  port: number,
  targetId?: string,
): Promise<CdpShot> {
  void injectAgentVisuals(port, targetId).catch(() => undefined);
  const res = await cdpCall(port, "Page.captureScreenshot", { format: "jpeg", quality: 60 }, targetId);
  if (!res.ok || !res.result) return { ok: false, error: res.error ?? "CDP-Fehler" };
  const data = typeof res.result.data === "string" ? res.result.data : "";
  if (!data) return { ok: false, error: "Leerer Screenshot." };
  return { ok: true, bytes: Uint8Array.from(Buffer.from(data, "base64")), url: res.url };
}

/**
 * Cheap port check — does anything listen on the CDP port for this profile?
 * Used to short-circuit the screenshot loop when no browser was ever started,
 * so the client is not hammered with "Profil nicht erreichbar" every 850 ms.
 */
async function cdpPortOpen(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type ChromeLaunch = { ok: true; binary: string } | { ok: false; detail: string };

/** `--load-extension` for Connect Sync when the folder exists (repo extensions/connect-sync). */
function connectSyncExtensionArgs(): string[] {
  const candidates = [
    process.env.CONNECT_SYNC_EXTENSION_DIR?.trim(),
    "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\extensions\\connect-sync",
  ].filter((dir): dir is string => Boolean(dir));
  const found = candidates.find((dir) => existsSync(`${dir}/manifest.json`));
  return found ? [`--load-extension=${found}`] : [];
}

/**
 * loopfix: Geschützter Start. Läuft das Profil schon, wird KEIN Prozess gestartet (früher:
 * "--new-window url" an die laufende Instanz => neues Fenster), sondern die URL per CDP im
 * vorhandenen Tab geöffnet. Rate-Limit + Schutzschalter siehe browser-launch-guard.ts.
 */
async function launchConnectChrome(
  url: string,
  profileDir: string,
): Promise<ChromeLaunch> {
  const res = await ensureProfileBrowser(profileDir, {
    label: "Connect-Browser",
    spawn: (port) => spawnConnectChromeRaw(url, profileDir, port),
  });
  if (!res.ok) return { ok: false, detail: res.error };
  if (res.reused && url && url !== "about:blank") {
    const opened = await openUrlInProfileTab(res.port, url, profileDir);
    if (!opened.ok) return { ok: false, detail: opened.error ?? "Navigation fehlgeschlagen" };
  }
  return { ok: true, binary: res.reused ? "running" : "helium" };
}

/** Roh-Start OHNE Schutz – nur über ensureProfileBrowser aufrufen. */
async function spawnConnectChromeRaw(
  url: string,
  profileDir: string,
  port: number,
): Promise<ChromeLaunch> {
  const normalized = profileDir.toLowerCase().replace(/\\/g, "/");
  const stefanHeliumUserData = (
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "imput", "Helium", "User Data")
      : "c:/users/kunc gmbh/appdata/local/imput/helium/user data"
  )
    .toLowerCase()
    .replace(/\\/g, "/");

  if (normalized === stefanHeliumUserData || normalized.startsWith(stefanHeliumUserData + "/")) {
    console.error("[connect-routes] SICHERHEITSBLOCK: Stefans eigenes Helium-Profil darf NIE berührt werden!", profileDir);
    return {
      ok: false,
      detail: "SICHERHEITSABBRUCH: Stefans eigenes Helium-Profil darf NIE verwendet werden!",
    };
  }

  const args = [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--hide-crash-restore-bubble", // loopfix: kein "Seiten wiederherstellen?" (koennte alte Fenster zurueckholen)
    "--no-default-browser-check",
    // CDP for the live preview: loopback only, one port per profile (see cdpPortFor).
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    // Connect Sync: Tabs dieses Browsers an Connect melden (Browser-Tab-Agenten, Mein Helium).
    ...connectSyncExtensionArgs(),
    // loopfix: kein --new-window (öffnete bei laufender Instanz jedes Mal ein neues Fenster).
    url || "about:blank",
  ];

  const candidates = resolveChromeBinaries();
  const errors: string[] = [];

  for (const binary of candidates) {
    if (!(await chromeBinaryExists(binary))) {
      errors.push(`${binary}: nicht gefunden`);
      continue;
    }
    if (process.platform === "win32") {
      try {
        const proc = Bun.spawn([binary, ...args], {
          stdout: "ignore",
          stderr: "ignore",
          stdin: "ignore",
        });
        proc.unref();
        return { ok: true, binary };
      } catch (err) {
        errors.push(`${binary}: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }
    try {
      const proc = Bun.spawn([binary, ...args], {
        stdout: "ignore",
        stderr: "pipe",
        stdin: "ignore",
      });
      // Chromium often daemonizes: the launcher exits 0 after spawning the real
      // browser. Treat exit 0 as success. Non-zero early exit is a real failure.
      const earlyExit = await Promise.race([
        proc.exited.then((code) => code),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),
      ]);
      if (earlyExit !== null && earlyExit !== 0) {
        let stderr = "";
        try {
          stderr = (await new Response(proc.stderr).text()).trim().slice(0, 240);
        } catch {
          /* ignore */
        }
        errors.push(
          `${binary}: beendet (code ${earlyExit})${stderr ? ` — ${stderr}` : ""}`,
        );
        continue;
      }
      void proc.exited.catch(() => undefined);
      return { ok: true, binary };
    } catch (err) {
      errors.push(
        `${binary}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    ok: false,
    detail:
      errors.join(" · ") ||
      "Kein Chrome/Edge gefunden. Connect ist der Browser — Connect.exe / ./START-APP.sh auf dem PC, oder CONNECT_CHROME_BIN setzen.",
  };
}

async function chromeBinaryExists(binary: string): Promise<boolean> {
  if (binary.includes("/") || binary.includes("\\")) {
    try {
      return await Bun.file(binary).exists();
    } catch {
      return false;
    }
  }
  try {
    const proc = Bun.spawn(["which", binary], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

function resolveChromeBinaries(): string[] {
  const fromEnv = process.env.CONNECT_CHROME_BIN?.trim();
  const winCandidates = [
    "C:\\Users\\Kunc GmbH\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe",
    "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\apps\\connect-app\\helium\\chrome.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const linux = [
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "brave-browser",
  ];
  // When API runs in WSL, prefer Windows host Chrome so the window appears on the PC.
  const winHost = [
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
    "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ];
  const ordered = [
    ...(fromEnv ? [fromEnv] : []),
    ...(process.platform === "win32" ? winCandidates : []),
    ...winHost,
    ...linux,
  ];
  return [...new Set(ordered)];
}

type PhoneDeviceRow = {
  serial: string;
  state: string;
  model?: string;
  product?: string;
  transportId?: string;
};

type PhoneHostProbe = {
  ok: boolean;
  adb: boolean;
  scrcpy: boolean;
  adbVersion?: string;
  scrcpyVersion?: string;
  devices: PhoneDeviceRow[];
  message?: string;
};

async function whichBinary(name: string): Promise<string | null> {
  const fromEnv =
    name === "adb"
      ? process.env.CONNECT_ADB_BIN?.trim()
      : name === "scrcpy"
        ? process.env.CONNECT_SCRCPY_BIN?.trim()
        : undefined;
  if (fromEnv) return fromEnv;
  try {
    const proc = Bun.spawn(["which", name], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const out = (await new Response(proc.stdout).text()).trim();
    const code = await proc.exited;
    if (code === 0 && out) return out.split("\n")[0]!.trim();
  } catch {
    /* ignore */
  }
  return null;
}

async function runCapture(
  cmd: string[],
  opts?: { maxBytes?: number },
): Promise<{ code: number; stdout: Uint8Array; stderr: string }> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const [stdoutBuf, stderrText, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    let bytes = new Uint8Array(stdoutBuf);
    const max = opts?.maxBytes ?? 16 * 1024 * 1024;
    if (bytes.byteLength > max) {
      bytes = bytes.slice(0, max);
    }
    return { code, stdout: bytes, stderr: stderrText.trim() };
  } catch (err) {
    return {
      code: 127,
      stdout: new Uint8Array(),
      stderr: err instanceof Error ? err.message : String(err),
    };
  }
}

function parseAdbDevices(raw: string): PhoneDeviceRow[] {
  const lines = raw.split(/\r?\n/).slice(1);
  const devices: PhoneDeviceRow[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const serial = parts[0];
    const state = parts[1];
    if (!serial || !state) continue;
    const extras: Record<string, string> = {};
    for (const part of parts.slice(2)) {
      const eq = part.indexOf(":");
      if (eq > 0) {
        extras[part.slice(0, eq)] = part.slice(eq + 1);
      }
    }
    devices.push({
      serial,
      state,
      model: extras.model,
      product: extras.product,
      transportId: extras.transport_id,
    });
  }
  return devices;
}

async function probePhoneHost(): Promise<PhoneHostProbe> {
  const adbBin = await whichBinary("adb");
  const scrcpyBin = await whichBinary("scrcpy");
  if (!adbBin) {
    return {
      ok: false,
      adb: false,
      scrcpy: Boolean(scrcpyBin),
      scrcpyVersion: undefined,
      devices: [],
      message:
        "ADB nicht gefunden. Android Platform-Tools installieren (adb) — Open-Source, Genymobile/scrcpy für Spiegelung.",
    };
  }
  const version = await runCapture([adbBin, "version"]);
  const adbVersion = new TextDecoder()
    .decode(version.stdout)
    .split("\n")[0]
    ?.trim();
  const list = await runCapture([adbBin, "devices", "-l"]);
  const devices = parseAdbDevices(new TextDecoder().decode(list.stdout));
  let scrcpyVersion: string | undefined;
  if (scrcpyBin) {
    const sc = await runCapture([scrcpyBin, "--version"]);
    scrcpyVersion = new TextDecoder()
      .decode(sc.stdout)
      .split("\n")[0]
      ?.trim();
  }
  return {
    ok: true,
    adb: true,
    scrcpy: Boolean(scrcpyBin),
    adbVersion,
    scrcpyVersion,
    devices,
    message: scrcpyBin
      ? undefined
      : "scrcpy fehlt (optional) — Spiegelung langsamer über ADB-Screenshots.",
  };
}

async function capturePhoneScreenshot(serial?: string): Promise<{
  ok: boolean;
  dataUrl?: string;
  serial?: string;
  error?: string;
}> {
  const adbBin = await whichBinary("adb");
  if (!adbBin) {
    return {
      ok: false,
      error: "ADB nicht gefunden — Platform-Tools installieren.",
    };
  }
  let target = serial;
  if (!target) {
    const list = await runCapture([adbBin, "devices", "-l"]);
    const online = parseAdbDevices(new TextDecoder().decode(list.stdout)).filter(
      (d) => d.state === "device",
    );
    target = online[0]?.serial;
    if (!target) {
      return {
        ok: false,
        error: "Kein Android mit Status „device“.",
      };
    }
  }
  const shot = await runCapture(
    [adbBin, "-s", target, "exec-out", "screencap", "-p"],
    { maxBytes: 12 * 1024 * 1024 },
  );
  if (shot.code !== 0 || shot.stdout.byteLength < 64) {
    return {
      ok: false,
      serial: target,
      error:
        shot.stderr ||
        "screencap fehlgeschlagen — USB-Debugging / Bildschirm entsperren.",
    };
  }
  // Bun Buffer → base64
  const b64 = Buffer.from(shot.stdout).toString("base64");
  return {
    ok: true,
    serial: target,
    dataUrl: `data:image/png;base64,${b64}`,
  };
}

async function adbConnect(
  host: string,
): Promise<{ ok: boolean; message: string; serial?: string }> {
  const adbBin = await whichBinary("adb");
  if (!adbBin) {
    return {
      ok: false,
      message: "ADB nicht gefunden — Platform-Tools installieren.",
    };
  }
  const result = await runCapture([adbBin, "connect", host]);
  const out = `${new TextDecoder().decode(result.stdout)} ${result.stderr}`.trim();
  const ok =
    result.code === 0 &&
    /connected to|already connected/i.test(out) &&
    !/unable to|failed|error/i.test(out);
  return {
    ok,
    message: out || (ok ? `Verbunden mit ${host}` : `adb connect fehlgeschlagen`),
    serial: ok ? host : undefined,
  };
}

async function runHeadlessInvokeCodex(
  prompt: string,
  files: string[],
): Promise<{ ran: boolean; ok: boolean; text: string }> {
  const candidates = [
    process.env.CONNECT_CODEX_INVOKE?.trim(),
    "/mnt/c/Users/Kunc GmbH/Desktop/Codex Sandboxen/Invoke-Codex.ps1",
    `${process.env.HOME || ""}/Desktop/Codex Sandboxen/Invoke-Codex.ps1`,
    `${process.env.USERPROFILE || ""}\\Desktop\\Codex Sandboxen\\Invoke-Codex.ps1`,
  ].filter((p): p is string => Boolean(p && p.length > 4));

  let script: string | undefined;
  for (const path of candidates) {
    if (await Bun.file(path).exists().catch(() => false)) {
      script = path;
      break;
    }
  }

  if (!script) {
    return { ran: false, ok: false, text: "" };
  }

  const instance =
    process.env.CONNECT_CODEX_INSTANCE?.trim() || "cli-1";
  const fileArgs =
    files.length > 0
      ? ["-Files", files.slice(0, 8).join(";")]
      : [];

  const shells = [
    process.env.CONNECT_POWERSHELL_BIN?.trim(),
    "pwsh.exe",
    "powershell.exe",
    "pwsh",
    "powershell",
  ].filter(Boolean) as string[];

  for (const shell of shells) {
    try {
      const args = [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-File",
        script,
        "-Instance",
        instance,
        "-Prompt",
        prompt.slice(0, 12_000),
        ...fileArgs,
      ];
      const proc = Bun.spawn([shell, ...args], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
        env: {
          ...process.env,
          CONNECT_HEADLESS: "1",
        },
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      const out = `${stdout}\n${stderr}`.trim();
      return {
        ran: true,
        ok: code === 0,
        text:
          out ||
          (code === 0
            ? `Codex (${instance}) fertig (kein Output).`
            : `Invoke-Codex exit ${code}`),
      };
    } catch {
      /* try next shell */
    }
  }

  return { ran: false, ok: false, text: "" };
}

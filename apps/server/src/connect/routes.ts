import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import type { Database } from "../db/client";
import { connectMedia, connectWorkspaceKv } from "../db/schema";

const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const DEPLOYMENT_MODE_KEY = "connect.deployment-mode";
const GLOBAL_KEYS = new Set([DEPLOYMENT_MODE_KEY]);

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
        if (GLOBAL_KEYS.has(row.key) || row.key.startsWith("u:")) continue;
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
    } | null;
    if (!body?.workspace || typeof body.workspace !== "object") {
      return context.json({ error: "workspace object required" }, 400);
    }
    const now = new Date();
    const payload = {
      ...body.workspace,
      "connect.account": {
        userId: actor.id,
        email: actor.email,
        name: actor.name ?? null,
        updatedAt: now.toISOString(),
      },
    };
    for (const [key, value] of Object.entries(payload)) {
      if (typeof key !== "string" || !key.trim()) continue;
      if (GLOBAL_KEYS.has(key)) continue;
      const storedKey = toUserKey(actor.id, key);
      const json = asJsonb(value);
      await database
        .insert(connectWorkspaceKv)
        .values({ key: storedKey, value: json, updatedAt: now })
        .onConflictDoUpdate({
          target: connectWorkspaceKv.key,
          set: { value: json, updatedAt: now },
        });
    }
    return context.json({
      ok: true,
      account: { userId: actor.id, email: actor.email, name: actor.name },
    });
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
      return context.json({ error: "Image too large or empty" }, 413);
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
    const safeUser =
      actor.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "default";
    const agentRaw =
      typeof body?.agentId === "string" ? body.agentId.trim() : "";
    const safeAgent = agentRaw
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64);
    const profileKind =
      body?.profileKind === "manus" ? "manus" : "default";
    const base =
      process.env.CONNECT_CHROME_PROFILE?.trim() ||
      `${process.env.HOME || "/tmp"}/.connect-chrome-profile/${safeUser}`;
    // Dedicated Manus profile: …/agents/{agentId}/manus — isolated from
    // the general agent Chrome profile (one Manus login per email).
    const profileDir = safeAgent
      ? profileKind === "manus"
        ? `${base}/agents/${safeAgent}/manus`
        : `${base}/agents/${safeAgent}`
      : base;

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

  return app;
}

type ChromeLaunch = { ok: true; binary: string } | { ok: false; detail: string };

async function launchConnectChrome(
  url: string,
  profileDir: string,
): Promise<ChromeLaunch> {
  const args = [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    url,
  ];

  const candidates = resolveChromeBinaries();
  const errors: string[] = [];

  for (const binary of candidates) {
    if (!(await chromeBinaryExists(binary))) {
      errors.push(`${binary}: nicht gefunden`);
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

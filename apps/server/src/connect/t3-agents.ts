/**
 * T3 Code — the agent harness behind Connect's "Agents" area.
 *
 * T3 Code runs its own local server and web app (the desktop app starts it on
 * loopback and writes `userdata/server-runtime.json`). Connect does not try to
 * own that process: it finds the running server, embeds its web app, and mints a
 * one-time pairing link when the browser has no session yet.
 *
 * Discovery order:
 *   1. `CONNECT_T3_URL` (explicit override, e.g. a Tailscale/Funnel address)
 *   2. `$T3CODE_HOME/userdata/server-runtime.json` (desktop-managed server)
 *   3. `http://127.0.0.1:3773` (T3's default loopback port)
 *
 * Only loopback origins are embedded by default. A non-loopback origin is
 * accepted only from an explicit `CONNECT_T3_URL`, so a stale runtime file can
 * never point Connect at an arbitrary machine.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getT3Flag } from "../t3-bridge/contracts";
import { getT3SidecarStatus } from "../t3-bridge/sidecar";

const DEFAULT_ORIGIN = "http://127.0.0.1:3773";
const PROBE_TIMEOUT_MS = 1500;
const PAIR_TIMEOUT_MS = 20_000;

export type T3AgentsStatus = {
  /** A T3 server answered on its origin. */
  running: boolean;
  /** Origin the Agents area embeds, or null when nothing is running. */
  url: string | null;
  host: string | null;
  port: number | null;
  /** `serverVersion` from T3's runtime file. */
  version: string | null;
  /** ISO timestamp of when that server started. */
  since: string | null;
  /** Absolute path of T3's CLI, when one can be found. */
  cli: string | null;
  /** Human-readable hint when nothing is running / pairing is unavailable. */
  message?: string;
};

type RuntimeFile = {
  host?: unknown;
  port?: unknown;
  origin?: unknown;
  serverVersion?: unknown;
  startedAt?: unknown;
  pid?: unknown;
};

function t3Home(): string {
  const fromEnv = process.env.T3CODE_HOME?.trim();
  return fromEnv || join(homedir(), ".t3");
}

function isLoopbackHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    bare === "localhost" ||
    bare === "::1" ||
    bare === "0.0.0.0" ||
    bare === "::" ||
    bare === "127.0.0.1" ||
    bare.startsWith("127.")
  );
}

/** A URL Connect may embed: http(s), and loopback unless explicitly configured. */
function safeOrigin(raw: string, { allowRemote }: { allowRemote: boolean }): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!allowRemote && !isLoopbackHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function originFromRuntime(runtime: RuntimeFile): string | null {
  if (typeof runtime.origin === "string") {
    const origin = safeOrigin(runtime.origin, { allowRemote: false });
    if (origin) return origin;
  }
  const host = typeof runtime.host === "string" ? runtime.host : "";
  const port = typeof runtime.port === "number" ? runtime.port : Number(runtime.port);
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  // A server bound to every interface is reachable on loopback.
  const connectHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return safeOrigin(`http://${connectHost}:${port}`, { allowRemote: false });
}

async function readRuntime(): Promise<{
  origin: string | null;
  version: string | null;
  since: string | null;
  host: string | null;
  port: number | null;
}> {
  const file = join(t3Home(), "userdata", "server-runtime.json");
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as RuntimeFile;
    const origin = originFromRuntime(raw);
    const url = origin ? new URL(origin) : null;
    return {
      origin,
      version: typeof raw.serverVersion === "string" ? raw.serverVersion : null,
      since: typeof raw.startedAt === "string" ? raw.startedAt : null,
      host: url?.hostname ?? null,
      port: url ? Number(url.port) : null,
    };
  } catch {
    return { origin: null, version: null, since: null, host: null, port: null };
  }
}

/**
 * Connect and T3 must share a hostname for the iframe to stay *same-site*.
 *
 * The app runs on `localhost:3101`, while T3's runtime file names `127.0.0.1`.
 * To Chromium those are two different sites, so T3's `SameSite=Lax` session
 * cookie is never sent inside the frame: pairing succeeds on the server (the
 * token is consumed and a session exists) but the app stays unauthenticated
 * and T3 reports the used token as invalid. Mirror the page's hostname onto
 * T3's loopback port instead — ports do not affect same-site.
 */
function withPreferredHost(
  origin: string,
  preferHost: string | null | undefined,
): string {
  const parsed = new URL(origin);
  if (!isLoopbackHost(parsed.hostname)) return origin;
  const raw = preferHost?.trim();
  let wanted: string | null = null;
  if (raw) {
    // The caller passes the request's Host header (`localhost:3101`), not a URL.
    try {
      wanted = new URL(`http://${raw}`).hostname.toLowerCase();
    } catch {
      wanted = null;
    }
  }
  if (wanted === "localhost" && parsed.hostname.toLowerCase() !== "localhost") {
    parsed.hostname = "localhost";
    return parsed.origin;
  }
  if (wanted && /^127\./.test(wanted) && parsed.hostname !== "127.0.0.1") {
    parsed.hostname = "127.0.0.1";
    return parsed.origin;
  }
  return origin;
}

async function isReachable(origin: string): Promise<boolean> {
  try {
    // Any HTTP answer means a server is listening there. `/` is the app shell;
    // a T3 server that has not finished booting still answers 5xx, which is not
    // "running" for our purposes.
    const response = await fetch(`${origin}/manifest.webmanifest`, {
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

function cliCandidates(): string[] {
  const home = t3Home();
  const win = process.platform === "win32";
  const out = [
    process.env.CONNECT_T3_BIN?.trim(),
    join(home, "bin", win ? "t3.cmd" : "t3"),
    join(home, "bin", "t3"),
    "/opt/homebrew/bin/t3",
    "/usr/local/bin/t3",
  ];
  return out.filter((value): value is string => Boolean(value));
}

async function resolveCli(): Promise<string | null> {
  for (const candidate of cliCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    const proc = Bun.spawn([process.platform === "win32" ? "where" : "which", "t3"], {
      stdout: "pipe",
      stderr: "ignore",
      stdin: "ignore",
    });
    const [text, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (code === 0) {
      const first = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (first && existsSync(first)) return first;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Der Connect-eigene Sidecar (A02) ist die erste Wahl, aber nur wenn die
 * Brücke aktiv ist. Sein Origin ist immer Loopback; ein manipulierter Status
 * kann Connect deshalb nicht auf eine fremde Maschine zeigen lassen.
 */
function ownSidecarOrigin(preferHost?: string | null): string | null {
  if (!getT3Flag("bridge")) return null;
  const status = getT3SidecarStatus();
  if (!status.running || !status.origin) return null;
  const origin = safeOrigin(status.origin, { allowRemote: false });
  return origin ? withPreferredHost(origin, preferHost) : null;
}

async function resolveOrigin(
  preferHost?: string | null,
): Promise<string | null> {
  const explicit = process.env.CONNECT_T3_URL?.trim();
  if (explicit) {
    // An explicitly configured (possibly remote) server is used verbatim.
    const origin = safeOrigin(explicit, { allowRemote: true });
    if (origin && (await isReachable(origin))) return origin;
  }
  const runtime = await readRuntime();
  const ownSidecar = ownSidecarOrigin(preferHost);
  const candidates = [
    ownSidecar,
    runtime.origin ? withPreferredHost(runtime.origin, preferHost) : null,
    runtime.origin,
    withPreferredHost(DEFAULT_ORIGIN, preferHost),
    DEFAULT_ORIGIN,
  ];
  for (const candidate of new Set(candidates)) {
    if (candidate && (await isReachable(candidate))) return candidate;
  }
  return null;
}

export type T3AgentsOptions = {
  /** Hostname the Connect page itself is served from (from the request Host header). */
  preferHost?: string | null;
};

export async function t3AgentsStatus(
  options: T3AgentsOptions = {},
): Promise<T3AgentsStatus> {
  const [origin, runtime, cli] = await Promise.all([
    resolveOrigin(options.preferHost),
    readRuntime(),
    resolveCli(),
  ]);

  if (!origin) {
    return {
      running: false,
      url: null,
      host: null,
      port: null,
      version: runtime.version,
      since: runtime.since,
      cli,
      message:
        "T3 Code läuft nicht. Starte die T3-Code-App auf diesem PC (oder `t3 start`), dann erneut prüfen.",
    };
  }

  const url = new URL(origin);
  return {
    running: true,
    url: origin,
    host: url.hostname,
    port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
    version: runtime.version,
    since: runtime.since,
    cli,
  };
}

/**
 * Mint a one-time pairing link for the running server.
 *
 * The T3 CLI owns token minting (it talks to the server over the desktop
 * control plane), so Connect asks the CLI instead of reimplementing it. The
 * returned URL keeps the token in the fragment — it never reaches a server log.
 */
export async function mintT3PairingLink(
  options: T3AgentsOptions = {},
): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const status = await t3AgentsStatus(options);
  if (!status.running || !status.url) {
    return { ok: false, error: status.message ?? "T3 Code läuft nicht." };
  }
  if (!status.cli) {
    return {
      ok: false,
      error:
        "T3-CLI nicht gefunden. Öffne die T3-Code-App einmal, damit sie ihren CLI-Befehl installiert.",
    };
  }

  // No spaces in the label: Bun's Windows batch-file launch splits an argument
  // that contains one before cmd.exe ever sees it.
  const args = ["pair", "--ttl", "15m", "--label", "Connect-Agents"];
  // Bun launches T3's generated `.cmd` wrapper on Windows directly; routing it
  // through `cmd.exe /c` would re-split the quoted program path. Windows paths
  // go in with forward slashes: Bun's Windows argv handling eats backslashes in
  // an argument, and `C:\Users\…` would arrive as `C:Users…`.
  const slash = (value: string) =>
    process.platform === "win32" ? value.replace(/\\/g, "/") : value;
  const proc = Bun.spawn([slash(status.cli), ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      T3CODE_HOME: slash(t3Home()),
      ELECTRON_RUN_AS_NODE: "1",
    },
  });

  const timeout = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }, PAIR_TIMEOUT_MS);

  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      return {
        ok: false,
        error:
          stderr.trim().slice(0, 300) ||
          `T3-Pairing fehlgeschlagen (Code ${code}).`,
      };
    }
    const match = /Pairing URL:\s*(\S+)/i.exec(stdout);
    const link = match?.[1];
    if (!link) {
      return { ok: false, error: "T3 hat keinen Pairing-Link zurückgegeben." };
    }
    const parsed = new URL(link);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "T3 hat einen ungültigen Pairing-Link zurückgegeben." };
    }
    const target = new URL(status.url);
    // The link must point at the server Connect found — never somewhere else.
    const sameServer =
      parsed.port === target.port &&
      (parsed.hostname === target.hostname ||
        (isLoopbackHost(parsed.hostname) && isLoopbackHost(target.hostname)));
    if (!sameServer) {
      return {
        ok: false,
        error: `T3-Pairing zeigt auf ${parsed.origin} statt ${status.url}.`,
      };
    }
    // Same port, same server — only the loopback hostname is aligned with the
    // page so the pairing cookie is first-party inside the iframe.
    parsed.hostname = target.hostname;
    return { ok: true, url: parsed.toString() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "T3-Pairing fehlgeschlagen.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

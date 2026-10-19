/**
 * Handy-Tunnel (helium-tunnel): Konfiguration, nur per Umgebung, keine PC-Pfade hart codiert.
 *
 *   CONNECT_TUNNEL_MODE         off | quick | named | external   (Standard: off)
 *                                 quick    = Cloudflare Quick-Tunnel (trycloudflare.com, ohne Konto, URL wechselt)
 *                                 named    = benannter Tunnel mit Token (feste Domain, CONNECT_TUNNEL_PUBLIC_URL)
 *                                 external = cloudflared laeuft ausserhalb (z.B. systemd auf einer VM); Connect startet nichts
 *   CONNECT_TUNNEL_BIN          Pfad zu cloudflared (sonst <tools>/cloudflared[.exe], sonst PATH)
 *   CONNECT_TUNNEL_TOKEN        Token des benannten Tunnels (oder CONNECT_TUNNEL_TOKEN_FILE)
 *   CONNECT_TUNNEL_PUBLIC_URL   feste oeffentliche URL (named/external), z.B. https://connect.example.de
 *   CONNECT_TUNNEL_DATA_DIR     Ablage fuer Geraete/Status (Standard: <Connect-Daten>/tunnel)
 *   CONNECT_TUNNEL_METRICS_PORT lokaler cloudflared-Metrics-Port (Standard 3198, nur 127.0.0.1)
 *   CONNECT_TUNNEL_PROTOCOL     http2 | quic | auto (Standard http2: geht auch, wenn UDP/QUIC gesperrt ist)
 *   CONNECT_TUNNEL_GUARD        on | off (Standard on). Schuetzt Anfragen ueber den Tunnel. Nicht abschalten.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type TunnelMode = "off" | "quick" | "named" | "external";

export type TunnelConfig = {
  mode: TunnelMode;
  guard: boolean;
  bin: string | null;
  token: string | null;
  publicUrl: string | null;
  dataDir: string;
  toolsDir: string;
  metricsPort: number;
  protocol: string;
  port: number;
  /** Lokaler Ursprung, wie ihn der Launcher setzt (CONNECT_APP_URL), z.B. http://localhost:3101. */
  localOrigin: string;
};

const env = (key: string) => {
  const value = process.env[key]?.trim();
  return value ? value : null;
};

function connectRoot(): string {
  const explicit = env("CONNECT_DATA_ROOT");
  if (explicit) return explicit;
  const local = env("LOCALAPPDATA");
  if (local) return join(local, "ConnectApp");
  return join(homedir(), ".connect-app");
}

function findOnPath(name: string): string | null {
  try {
    return (globalThis as { Bun?: { which(n: string): string | null } }).Bun?.which(name) ?? null;
  } catch {
    return null;
  }
}

export function loadTunnelConfig(port: number): TunnelConfig {
  const root = connectRoot();
  const toolsDir = env("CONNECT_TUNNEL_TOOLS_DIR") ?? join(root, "tools");
  const exe = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
  const bundled = join(toolsDir, exe);
  const bin = env("CONNECT_TUNNEL_BIN") ?? (existsSync(bundled) ? bundled : findOnPath("cloudflared"));
  const rawMode = (env("CONNECT_TUNNEL_MODE") ?? "off").toLowerCase();
  const mode: TunnelMode = (["off", "quick", "named", "external"] as const).includes(rawMode as TunnelMode)
    ? (rawMode as TunnelMode)
    : "off";
  let token = env("CONNECT_TUNNEL_TOKEN");
  const tokenFile = env("CONNECT_TUNNEL_TOKEN_FILE");
  if (!token && tokenFile && existsSync(tokenFile)) token = readFileSync(tokenFile, "utf8").trim() || null;
  const publicUrl = env("CONNECT_TUNNEL_PUBLIC_URL")?.replace(/\/+$/, "") ?? null;
  const localOrigin = (env("CONNECT_APP_URL") ?? `http://localhost:${port}`).replace(/\/+$/, "");
  return {
    mode,
    guard: (env("CONNECT_TUNNEL_GUARD") ?? "on").toLowerCase() !== "off",
    bin,
    token,
    publicUrl,
    dataDir: env("CONNECT_TUNNEL_DATA_DIR") ?? join(env("CONNECT_DATA_DIR") ?? join(root, "data"), "tunnel"),
    toolsDir,
    metricsPort: Number(env("CONNECT_TUNNEL_METRICS_PORT")) || 3198,
    protocol: ["http2", "quic", "auto"].includes((env("CONNECT_TUNNEL_PROTOCOL") ?? "").toLowerCase()) ? (env("CONNECT_TUNNEL_PROTOCOL") as string).toLowerCase() : "http2",
    port,
    localOrigin,
  };
}

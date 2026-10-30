/**
 * helium-cliremote (23.10.2026): Projektordner-Auswahl + Audit fuer CLI-Sitzungen,
 * die ueber den Handy-/Laptop-Tunnel (gekoppeltes Geraet) gestartet werden.
 *
 * - Nur Ordner unterhalb erlaubter Wurzeln (Standard: Downloads, Documents, Desktop des
 *   Windows-Benutzers; ueberschreibbar per CONNECT_REMOTE_ROOTS, Trennzeichen ";").
 * - Pfade werden per realpath aufgeloest (keine Symlink-/Junction-Flucht, kein "..").
 * - Es werden nur Ordnernamen gelistet, keine Dateiinhalte.
 * - Jede Aktion landet als JSON-Zeile in %LOCALAPPDATA%\ConnectApp\data\audit\remote-cli.jsonl.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

/** Vom Tunnel-Gate gesetzt (und bei allen anderen Anfragen entfernt): Kennung des gekoppelten Geraets. */
export const TUNNEL_DEVICE_HEADER = "x-connect-tunnel-device";

const isWin = process.platform === "win32";
const norm = (p: string) => (isWin ? p.toLowerCase() : p);

function real(p: string): string | null {
  try {
    return realpathSync.native ? realpathSync.native(p) : realpathSync(p);
  } catch {
    return null;
  }
}

export type RemoteRoot = { label: string; path: string };

export function allowedRoots(): RemoteRoot[] {
  const fromEnv = (process.env.CONNECT_REMOTE_ROOTS ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const home = process.env.USERPROFILE || homedir();
  const candidates: RemoteRoot[] = fromEnv.length
    ? fromEnv.map((p) => ({ label: p, path: p }))
    : [
        { label: "Downloads", path: join(home, "Downloads") },
        { label: "Dokumente", path: join(home, "Documents") },
        { label: "Desktop", path: join(home, "Desktop") },
      ];
  const out: RemoteRoot[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const r = real(c.path);
    if (!r || seen.has(norm(r))) continue;
    try {
      if (!statSync(r).isDirectory()) continue;
    } catch {
      continue;
    }
    seen.add(norm(r));
    out.push({ label: c.label, path: r });
  }
  return out;
}

const FORBIDDEN = [/[\\/]appdata([\\/]|$)/i, /[\\/]\.ssh([\\/]|$)/i, /[\\/]helium[\\/]user data/i];

/** Loest einen Ordner auf und prueft, dass er innerhalb einer erlaubten Wurzel liegt. */
export function resolveAllowedDir(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new Error("Kein Ordner angegeben.");
  if (input.includes("\0")) throw new Error("Ungueltiger Pfad.");
  const r = real(resolve(input.trim()));
  if (!r) throw new Error("Ordner existiert nicht.");
  let isDir = false;
  try {
    isDir = statSync(r).isDirectory();
  } catch {}
  if (!isDir) throw new Error("Kein Ordner.");
  const inside = allowedRoots().some((root) => {
    const a = norm(root.path);
    const b = norm(r);
    return b === a || b.startsWith(a.endsWith(sep) ? a : a + sep);
  });
  if (!inside) throw new Error("Ordner liegt ausserhalb der erlaubten Bereiche (Downloads/Dokumente/Desktop).");
  if (FORBIDDEN.some((re) => re.test(r))) throw new Error("Dieser Ordner ist gesperrt.");
  return r;
}

export function listDirs(input: unknown): { path: string; parent: string | null; dirs: { name: string; path: string }[] } {
  const dir = resolveAllowedDir(input);
  const dirs: { name: string; path: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith(".") || name === "node_modules" || name === "$RECYCLE.BIN" || name === "System Volume Information") continue;
    dirs.push({ name, path: join(dir, name) });
    if (dirs.length >= 500) break;
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  let parent: string | null = join(dir, "..");
  try {
    resolveAllowedDir(parent);
  } catch {
    parent = null;
  }
  return { path: dir, parent, dirs };
}

function auditPath(): string {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectApp", "data", "audit")
    : join(homedir(), ".connect-app", "audit");
  if (!existsSync(base)) mkdirSync(base, { recursive: true });
  return join(base, "remote-cli.jsonl");
}

/** Audit-Eintrag (best effort, niemals mit Eingabetexten/Secrets). */
export function auditCli(
  request: Request | { headers: Headers },
  actor: { id?: string; email?: string } | null | undefined,
  action: string,
  details: Record<string, unknown> = {},
): void {
  try {
    const device = request.headers.get(TUNNEL_DEVICE_HEADER);
    const line = JSON.stringify({
      at: new Date().toISOString(),
      via: device ? "tunnel" : "local",
      device: device || null,
      user: actor?.email || actor?.id || null,
      action,
      ...details,
    });
    appendFileSync(auditPath(), line + "\n", "utf8");
  } catch {
    // Audit ist best effort
  }
}

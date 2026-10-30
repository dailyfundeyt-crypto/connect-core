/**
 * A40 — Lane-Prüfung (QA-Werkzeug, Lane `tests/e2e/t3/**`).
 *
 * Vergleicht die tatsächlich geänderten/neu angelegten Dateien im Repo gegen die
 * verbindliche Lane-Tabelle aus `docs/t3/LANES.md` und meldet:
 *   - Dateien, die in keine Lane passen (Lane-Verletzung)
 *   - Dateien, die zu mehreren Lanes passen (Überschneidung)
 *   - geänderte Bestandsdateien ohne `.bak-helium-<datum>`-Sicherung (Regel 2)
 *
 * Nur lesend. Das Werkzeug ändert nichts.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const REPO_ROOT = process.env.A40_REPO_ROOT ?? process.cwd();

export type LaneEntry = {
  readonly agent: string;
  readonly wave: string;
  readonly globs: readonly string[];
};

export type LaneFinding = {
  readonly kind: "violation" | "overlap" | "backup-missing" | "deleted";
  readonly file: string;
  readonly detail: string;
};

/**
 * Wandelt einen Lane-Glob in einen regulären Ausdruck.
 *
 * Unterstützt werden:
 *   `**`        — beliebig viele Pfadsegmente (auch keins)
 *   `*`         — ein Pfadsegment ohne `/`
 *   `?`         — ein einzelnes Zeichen
 *
 * Das ist bewusst kein voller Glob-Parser: Lane-Pfade sind glatt und
 * brauchen nur diese drei Muster.
 */
const globToRegExp = (glob: string): RegExp => {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]!;
    if (char === "*") {
      if (glob[i + 1] === "*") {
        // `**/` verschluckt auch den Trenner; `**` am Ende auch den Rest.
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
        continue;
      }
      out += "[^/]*";
      continue;
    }
    if (char === "?") {
      out += "[^/]";
      continue;
    }
    out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
};

export function matchesGlob(file: string, glob: string): boolean {
  return globToRegExp(glob).test(file.split(sep).join("/"));
}

export function parseLanes(markdown: string): LaneEntry[] {
  const lanes: LaneEntry[] = [];
  const rows = markdown.split("\n").filter((line) => line.trim().startsWith("|"));
  for (const row of rows) {
    const cells = row
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (cells.length < 4) continue;
    const agent = cells[0];
    if (!/^A\d{2}$/.test(agent)) continue;
    const laneCell = cells[3];
    const globs = laneCell
      .split(/<br\s*\/?>/i)
      .map((entry) => entry.trim().replace(/`/g, ""))
      .filter((entry) => entry.length > 0 && entry !== "–" && entry !== "-");
    lanes.push({ agent, wave: cells[1], globs });
  }
  return lanes;
}

export function loadLanes(repoRoot: string = REPO_ROOT): LaneEntry[] {
  const path = join(repoRoot, "docs", "t3", "LANES.md");
  return parseLanes(readFileSync(path, "utf8"));
}

export function matchLanes(file: string, lanes: readonly LaneEntry[]): LaneEntry[] {
  return lanes.filter((lane) =>
    lane.globs.some((glob) => matchesGlob(file, glob)),
  );
}

/**
 * Prüft, ob für eine geänderte Bestandsdatei eine Sicherung existiert.
 * Der Suffix darf ein Datum oder Datum+Uhrzeit tragen.
 */
export function findBackup(repoRoot: string, file: string): string | null {
  // Git liefert Pfade mit `/`, auch unter Windows. `path.sep` ist dort `\`.
  // Deshalb wird auf beiden Trennern gesucht.
  const normalized = file.split("\\").join("/");
  const dir = join(repoRoot, normalized, "..");
  const base = normalized.split("/").pop() ?? normalized;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const prefix = `${base}.bak-helium-`;
  const hit = entries.filter((entry) => entry.startsWith(prefix)).sort();
  return hit.length > 0 ? hit[hit.length - 1] : null;
}

export function listFilesRecursive(root: string, out: string[] = []): string[] {
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const full = join(root, entry);
    const info = statSync(full);
    if (info.isDirectory()) listFilesRecursive(full, out);
    else out.push(full);
  }
  return out;
}

export const isBackup = (file: string): boolean =>
  file.includes(".bak-helium-");

/**
 * Pfad-Marker, die eine Datei als **T3-Arbeit** kennzeichnen.
 *
 * Warum nicht über Zeitstempel: Im Arbeitsbaum tragen viele Dateien einen
 * gemeinsamen, gebündelten Zeitstempel (ein Kopiervorgang setzt sie alle
 * gleichzeitig). Eine Zeitgrenze ist damit als „wurde im T3-Projekt angefasst"
 * nicht belastbar.
 *
 * Stattdessen gilt: eine Datei ist T3-Arbeit, wenn ihr Pfad auf einen der
 * T3-Bausteine zeigt — die Brücke, die Maschinen, die Flotte, die Avatare,
 * die T3-Bausteine der Oberfläche, die Chat-/CLI-Verdrahtung oder die
 * neuen Datenbanktabellen.
 *
 * Alles andere (der alte v06-Baum, swarm, dailyfun, connect-mcp …) war
 * schon vorher im Arbeitsbaum und ist **nicht** Teil des T3-Projekts.
 */
export const T3_PATH_MARKERS: readonly string[] = [
  "apps/server/src/t3-bridge/",
  "apps/server/src/cua/",
  "apps/server/src/company-usage/",
  "apps/server/src/agent-avatar/",
  "apps/server/src/db/schema/t3.ts",
  "apps/server/drizzle/",
  "apps/app/src/lib/t3/",
  "apps/app/src/components/channels/t3/",
  "apps/app/src/components/agents/t3-cli-selector/",
  "apps/app/src/components/agents/bot-pane/",
  "apps/app/src/components/agents/browser-dock/",
  "apps/app/src/components/agents/create-bot-dialog/",
  "apps/app/src/components/agents/agent-grid/",
  "apps/app/src/components/app-sidebar/agent-grid/",
  "apps/app/src/components/app-sidebar/agent-grid/",
  "apps/app/src/components/companies/token-usage/",
  "apps/app/src/components/fleet/",
  "apps/app/src/components/onboarding/machines/",
  "apps/app/src/components/phone-t3/",
  "apps/app/src/components/settings/machines/",
  "apps/app/src/components/settings/t3/",
  "apps/app/src/components/usage-t3/",
  "apps/app/src/lib/agents/agent-avatar.ts",
  "apps/app/src/lib/agents/agent-folders.ts",
  "apps/app/src/lib/bot-avatar/",
  "apps/app/src/components/bot-avatar/",
  "apps/app/src/components/phone-t3/",
  "apps/app/src/t3/",
  "tools/t3-sidecar/",
  "tools/cua/",
  "tools/helium-embed/",
  "docs/t3/",
  "docs/helium-embed/",
  "docs/ideen/",
  "tests/e2e/t3/",
];

/** Ist die Datei (nach Normalisierung auf `/`) T3-Arbeit? */
export function isT3File(file: string): boolean {
  const normalized = file.split("\\").join("/");
  return T3_PATH_MARKERS.some((marker) => normalized.includes(marker));
}

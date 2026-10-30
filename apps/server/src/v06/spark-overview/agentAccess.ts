/**
 * A17 – Agenten-Datenzugriff: Auf welche Spark-Daten greift ein bestimmter
 * Agent zu?
 *
 * Drei Quellen fließen zusammen:
 *   1. `agent_data_access_log` (Migration 0400) — was Agenten über die
 *      Spark-Endpunkte gelesen haben (Kinds: note/folder/link/db/file).
 *   2. `log.md` des Brain — die bestehenden Brain-Zugriffszeilen der lokalen
 *      Agenten (nur gelesen; die Datei wird von A08 verwaltet, Regel 11).
 *   3. `agents.json` — die „Checkbox-Zugriffe“ des Scope-Editors
 *      (Lese-/Schreib-Bereiche + Datei-Regeln je Agent).
 *
 * `logAgentAccess(agentId, source)` ist der Schreibkanal, den der
 * Integrations-Agent bei A08/A18 anschließen wird: Fire-and-forget, darf einen
 * Anfrage-Pfad niemals scheitern lassen. Ohne Datenbank fällt der Store auf ein
 * begrenztes In-Memory-Gedächtnis zurück, damit die Übersicht auch ohne
 * Migrationstabelle antwortet — für die dauerhafte Historie dient Migration 0400.
 *
 * // TODO-CONTRACT: `AgentDataAccess.sources[].kind` kommt aus
 * contracts/v06/spark-overview.ts. Das Optionalfeld `access` wird lokal
 * ergänzt (Superset); will A00 das Feld in den Vertrag aufnehmen, begleitet das
 * migrate-to-skills? Nein — begleitet den Bericht „Contract-Änderungswunsch“.
 */
import { readLog, readAgents, coreOf, brainRootFor, resolveBrainRoot, type BrainAgentEntry } from "../../brain/store";
import type { AgentDataAccess } from "../../contracts/v06/spark-overview";

/** Quelle-Zeile mit dem lokalen Extra „Checkbox-Merker“ (read/write). */
export type AgentSourceRow = AgentDataAccess["sources"][number] & {
  /**TYPO-CONTRACT-RESERVE: aus agents.json abgelesen; im Contract noch nicht enthalten. */
  access?: "read" | "write";
};

/** Bewusst kein Intersection mit AgentDataAccess: `.sources` muss AgentSourceRow[]
 *  bleiben, damit das Superset-Feld `access` bei `find`/Zugriff sichtbar bleibt. */
export type AgentAccessResult = {
  agentId: string;
  sources: AgentSourceRow[];
};

export type AgentAccessSourceKind = AgentDataAccess["sources"][number]["kind"];

export function isAgentAccessSourceKind(value: unknown): value is AgentAccessSourceKind {
  return value === "note" || value === "folder" || value === "link" || value === "db" || value === "file";
}

export type AgentAccessEvent = {
  agentId: string;
  kind: AgentAccessSourceKind;
  ref: string;
  at: Date;
};

/** Lager für den Zugriffs-Log; austauschbar für Tests. */
export type AgentAccessBackend = {
  append: (event: AgentAccessEvent) => Promise<void>;
  listByAgent: (agentId: string) => Promise<{ kind: AgentAccessSourceKind; ref: string; at: Date }[]>;
};

/* ------------------------------------------------------------------ Backends */

const MEMORY_CAP_PER_AGENT = 2000;
const memoryByAgent = new Map<string, AgentAccessEvent[]>();

const memoryBackend: AgentAccessBackend = {
  append: async (event) => {
    const list = memoryByAgent.get(event.agentId) ?? [];
    list.push(event);
    // Ein durcheinanderlaufender Agent stopft damit das RAM nicht zu.
    if (list.length > MEMORY_CAP_PER_AGENT) list.splice(0, list.length - MEMORY_CAP_PER_AGENT);
    memoryByAgent.set(event.agentId, list);
  },
  listByAgent: async (agentId) =>
    (memoryByAgent.get(agentId) ?? []).map((event) => ({ kind: event.kind, ref: event.ref, at: event.at })),
};

type PostgresClient = {
  unsafe: (query: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
};

let postgresClient: PostgresClient | null | undefined;
let postgresAttempted = false;

/**
 * Postgres-Client faul öffnen; `null` = keine Datenbank zu haben, In-Memory genügt.
 * Derselbe Treiber wie `brain/store.ts`, mit `prepare: false` PgBouncer-sicher.
 */
async function getPostgres(): Promise<PostgresClient | null> {
  if (postgresAttempted) return postgresClient ?? null;
  postgresAttempted = true;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    postgresClient = null;
    return null;
  }
  try {
    const { default: postgres } = (await import("postgres")) as unknown as {
      default: (url: string, options?: Record<string, unknown>) => PostgresClient;
    };
    postgresClient = postgres(url, { max: 1, idle_timeout: 20, prepare: false });
  } catch {
    postgresClient = null;
  }
  return postgresClient;
}

let activeBackend: AgentAccessBackend = memoryBackend;

/** Nur für Tests: Lager austauschen (z. B. ein Backend, das Ereignisse zählt). */
export function setAgentAccessBackend(backend: AgentAccessBackend | null): void {
  activeBackend = backend ?? memoryBackend;
}

function dbBackend(db: PostgresClient): AgentAccessBackend {
  return {
    append: async (event) => {
      await db.unsafe(
        "INSERT INTO agent_data_access_log (agent_id, kind, ref, at) VALUES ($1, $2, $3, $4)",
        [event.agentId, event.kind, event.ref, event.at.toISOString()],
      );
    },
    listByAgent: async (agentId) =>
      (
        await db.unsafe(
          "SELECT kind, ref, at FROM agent_data_access_log WHERE agent_id = $1 ORDER BY at DESC LIMIT 5000",
          [agentId],
        )
      ).map((row) => ({
        kind: row.kind as AgentAccessSourceKind,
        ref: String(row.ref ?? ""),
        at: new Date(String(row.at)),
      })),
  };
}

/**
 * Lager wählen: die Test-/Explizit-Alternative, sonst Postgres, sonst Gedächtnis.
 * Der Log ist ein Beobachtungs-Kanal, nicht die kritische Schreibstrasse — ihn
 * scheitern zu lassen wäre eine mangelnde Zurückhaltung, die nichts beherrscht.
 */
async function backend(): Promise<AgentAccessBackend> {
  if (activeBackend !== memoryBackend) return activeBackend;
  const db = await getPostgres();
  return db ? dbBackend(db) : memoryBackend;
}

/* ------------------------------------------------------------------ Schreiben */

/**
 * Ein Datenzugriff eines Agenten wird protokolliert. `source` ist eine
 * Referenz — String oder Objekt:
 *   - `logAgentAccess(agentId, "Kern/Plan.md")`             → kind "note"
 *   - `logAgentAccess(agentId, { kind: "link", ref: url })` → explizites Kind
 * Wirft nie (Best-Effort-Log); Fehler landen als `console.error`, nie in einem
 * Anfrage-Antwortpfad.
 */
export async function logAgentAccess(
  agentId: string,
  source: string | { kind: AgentAccessSourceKind; ref: string },
  at: Date = new Date(),
): Promise<void> {
  if (!agentId?.trim() || !source) return;
  const kind = typeof source === "string" ? inferKind(source) : source.kind;
  const ref = (typeof source === "string" ? source : source.ref)?.trim();
  if (!ref || !isAgentAccessSourceKind(kind)) return;
  try {
    const store = await backend();
    await store.append({ agentId: agentId.trim().slice(0, 200), kind, ref: ref.slice(0, 600), at });
  } catch (error) {
    console.error(JSON.stringify({ type: "agent-access-log-write-failed", error: String(error) }));
  }
}

function inferKind(ref: string): AgentAccessSourceKind {
  if (/^https?:\/\//i.test(ref)) return "link";
  if (/\.(md|txt)$/i.test(ref)) return "note";
  return "folder";
}

/* ------------------------------------------------------------------ Lesen */

/** Übersicht: Auf welche Spark-Quellen greift ein Agent zu? */
export async function agentDataAccess(
  agentId: string,
  options: { rootOverride?: string | null } = {},
): Promise<AgentAccessResult> {
  const sources = new Map<string, AgentSourceRow>();
  const touch = (
    kind: AgentAccessSourceKind,
    ref: string,
    at: Date,
    extra?: { access?: "read" | "write" },
  ) => {
    const key = `${kind}:${ref}`;
    const existing = sources.get(key);
    const stamp = Number.isNaN(at.getTime()) ? new Date(0) : at;
    if (existing) {
      existing.count += 1;
      if (stamp.toISOString() > existing.lastAccess) existing.lastAccess = stamp.toISOString();
      if (extra?.access) existing.access = extra.access;
      return;
    }
    sources.set(key, { kind, ref, count: 1, lastAccess: stamp.toISOString(), ...extra });
  };

  /* 1. agent_data_access_log */
  try {
    const store = await backend();
    for (const event of await store.listByAgent(agentId)) {
      touch(event.kind, event.ref, event.at);
    }
  } catch (error) {
    console.error(JSON.stringify({ type: "agent-access-log-read-failed", error: String(error) }));
  }

  /* 2. + 3. Brain: log.md und agents.json — nur lesen */
  const root = options.rootOverride ?? brainRootFor(null);
  if (root) {
    const resolved = await resolveBrainRoot(root);
    if (resolved.available) {
      const core = coreOf(resolved.root);
      const [agentsFile, logEntries] = await Promise.all([
        readAgents(core).catch(() => null),
        readLog(core).catch(() => []),
      ]);
      await readBrainSources({ agentId, agents: agentsFile?.agents ?? [], logEntries: logEntries ?? [] }, touch);
    }
  }

  const list = [...sources.values()].sort(
    (a, b) => b.count - a.count || b.lastAccess.localeCompare(a.lastAccess),
  );
  return { agentId, sources: list };
}

async function readBrainSources(
  input: { agentId: string; agents: BrainAgentEntry[]; logEntries: { date: string; time: string; agent: string; action: string; files: string[] }[] },
  touch: (kind: AgentAccessSourceKind, ref: string, at: Date, extra?: { access?: "read" | "write" }) => void,
): Promise<void> {
  const { agentId, agents, logEntries } = input;
  const linked = agents.find(
    (agent) => agent.connectAgentId === agentId || agent.slug === agentId,
  );

  /* Brain-Log: Zeilen des Agenten werden als Notiz-Zugriffe gezählt. */
  for (const entry of logEntries) {
    const own = agents.find(
      (agent) => agent.slug === entry.agent || agent.connectAgentId === entry.agent,
    );
    const matches = linked
      ? linked.slug === entry.agent || linked.connectAgentId === entry.agent
      : entry.agent === agentId || own !== undefined;
    if (!matches) continue;
    const at = atFromLog(entry.date, entry.time);
    for (const file of entry.files) {
      if (!file || file === "-") continue;
      touch("note", file, at, { access: /append|write|create|save|edit|rename/.test(entry.action) ? "write" : "read" });
    }
  }

  /* agents.json: Checkbox-Zugriffe des Scope-Editors. */
  const scope = linked ?? agents.find((agent) => agent.slug === agentId);
  if (!scope) return;
  for (const area of scope.read) touch("folder", `Bereich:${area}`, new Date(0), { access: "read" });
  for (const area of scope.write) touch("folder", `Bereich:${area}`, new Date(0), { access: "write" });
  for (const rule of scope.files ?? []) {
    touch(rule.read ? "file" : "folder", rule.path, new Date(0), {
      access: rule.write ? "write" : "read",
    });
  }
}

function atFromLog(date: string, time: string): Date {
  const parsed = new Date(`${date}T${time.padStart(5, "0")}:00Z`);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

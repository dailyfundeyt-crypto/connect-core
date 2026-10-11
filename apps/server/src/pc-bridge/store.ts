/**
 * Handy-Brücke (PC-Bridge): Auftrags-Warteschlange in der Online-Datenbank (Supabase).
 *
 * Das Handy (Vercel) legt pro Nachricht an einen „PC-Agenten“ einen Auftrag an, der PC-Worker in der
 * Connect App holt ihn über eine AUSGEHENDE Verbindung ab, führt die Anbieter-CLI lokal aus und
 * schreibt die Antwort zurück. Kein offener Port, kein Tunnel.
 *
 * Bewusst ohne Treiber-Import: `Q` ist ein dünner Wrapper um `sql.unsafe(text, params)`, damit derselbe
 * Code im Vercel-Bundle (Bun SQL von drizzle) und im PC-Worker (eigene Bun-SQL-Verbindung) läuft.
 * Tabellen entstehen additiv (IF NOT EXISTS) und haben Row-Level-Security an, ohne Policies: über die
 * öffentliche Supabase-API (anon/authenticated) sind sie damit nicht erreichbar, nur direkt per Postgres.
 */

export type Row = Record<string, unknown>;
export type Q = (text: string, params?: unknown[]) => Promise<Row[]>;

export const PC_PROVIDERS = ["codex-cli", "claude-cli", "grok-bot"] as const;
export type PcProvider = (typeof PC_PROVIDERS)[number];
export const isPcProvider = (value: unknown): value is PcProvider => typeof value === "string" && (PC_PROVIDERS as readonly string[]).includes(value);

export const PROVIDER_LABELS: Record<PcProvider, string> = {
  "codex-cli": "Codex (ChatGPT-Login)",
  "claude-cli": "Claude (Claude-Login)",
  "grok-bot": "Grok Bot",
};

/** A PC counts as online when its heartbeat (every 20 s) is younger than this. */
export const ONLINE_WINDOW_SECONDS = 75;

export type PcProviderInfo = { kind: PcProvider; label: string; ready: boolean; detail: string; models: string[] };
export type PcGrokBot = { id: string; name: string; title?: string; description?: string };

export type PcWorkerRow = {
  owner_user_id: string;
  worker_id: string;
  label: string | null;
  version: string | null;
  providers: PcProviderInfo[];
  grok_bots: PcGrokBot[];
  last_seen: string;
  online: boolean;
};

export type PcLink = { agent_id: string; owner_user_id: string; provider: PcProvider; model: string; label: string | null; updated_at: string };

export type PcJob = {
  id: string;
  owner_user_id: string;
  agent_id: string;
  provider: PcProvider;
  model: string;
  prompt: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  output: string;
  error: string | null;
};

function json<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value ?? fallback) as T;
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS connect_pc_workers (
    owner_user_id text PRIMARY KEY,
    worker_id text NOT NULL,
    label text,
    version text,
    providers jsonb NOT NULL DEFAULT '[]'::jsonb,
    grok_bots jsonb NOT NULL DEFAULT '[]'::jsonb,
    last_seen timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS connect_pc_jobs (
    id text PRIMARY KEY,
    owner_user_id text NOT NULL,
    agent_id text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    prompt text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    output text NOT NULL DEFAULT '',
    error text,
    worker_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS connect_pc_jobs_queue_idx ON connect_pc_jobs (owner_user_id, status, created_at)`,
  `CREATE TABLE IF NOT EXISTS connect_pc_agent_links (
    agent_id text PRIMARY KEY,
    owner_user_id text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    label text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE connect_pc_workers ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE connect_pc_jobs ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE connect_pc_agent_links ENABLE ROW LEVEL SECURITY`,
];

const ready = new WeakMap<Q, Promise<void>>();

export function ensurePcTables(q: Q): Promise<void> {
  let promise = ready.get(q);
  if (!promise) {
    promise = (async () => {
      for (const statement of DDL) await q(statement);
    })();
    promise.catch(() => ready.delete(q));
    ready.set(q, promise);
  }
  return promise;
}

// ------------------------------------------------------------------ worker (PC side)

export async function heartbeat(
  q: Q,
  input: { ownerUserId: string; workerId: string; label: string; version: string; providers?: PcProviderInfo[]; grokBots?: PcGrokBot[] },
) {
  await ensurePcTables(q);
  await q(
    `INSERT INTO connect_pc_workers (owner_user_id, worker_id, label, version, providers, grok_bots, last_seen)
     VALUES ($1, $2, $3, $4, COALESCE($5::text::jsonb, '[]'::jsonb), COALESCE($6::text::jsonb, '[]'::jsonb), now())
     ON CONFLICT (owner_user_id) DO UPDATE SET
       worker_id = EXCLUDED.worker_id, label = EXCLUDED.label, version = EXCLUDED.version, last_seen = now(),
       providers = CASE WHEN $5::text IS NULL THEN connect_pc_workers.providers ELSE EXCLUDED.providers END,
       grok_bots = CASE WHEN $6::text IS NULL THEN connect_pc_workers.grok_bots ELSE EXCLUDED.grok_bots END`,
    [
      input.ownerUserId,
      input.workerId,
      input.label,
      input.version,
      input.providers ? JSON.stringify(input.providers) : null,
      input.grokBots ? JSON.stringify(input.grokBots) : null,
    ],
  );
}

/** Takes the oldest waiting job of this owner (SKIP LOCKED: two workers never get the same job). */
export async function claimJob(q: Q, ownerUserId: string, workerId: string): Promise<PcJob | null> {
  const rows = await q(
    `UPDATE connect_pc_jobs SET status = 'running', claimed_at = now(), updated_at = now(), worker_id = $2
     WHERE id = (
       SELECT id FROM connect_pc_jobs
       WHERE owner_user_id = $1 AND status = 'queued' AND created_at > now() - interval '5 minutes'
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     RETURNING id, owner_user_id, agent_id, provider, model, prompt, status, output, error`,
    [ownerUserId, workerId],
  );
  return (rows[0] as PcJob | undefined) ?? null;
}

/** Writes the answer so far; returns the job's status so the worker sees a cancel from the phone. */
export async function writeProgress(q: Q, jobId: string, output: string): Promise<string | null> {
  const rows = await q(`UPDATE connect_pc_jobs SET output = $2, updated_at = now() WHERE id = $1 RETURNING status`, [jobId, output]);
  return (rows[0]?.status as string | undefined) ?? null;
}

export async function finishJob(q: Q, jobId: string, result: { output: string; error?: string | null }) {
  await q(
    `UPDATE connect_pc_jobs SET output = $2, error = $3, status = CASE WHEN status = 'cancelled' THEN 'cancelled' WHEN $3::text IS NULL THEN 'done' ELSE 'error' END,
       updated_at = now(), finished_at = now() WHERE id = $1`,
    [jobId, result.output, result.error ?? null],
  );
}

/** Finished jobs hold chat text; they are only needed for the reply, so they do not pile up. */
export async function pruneJobs(q: Q, ownerUserId: string) {
  await q(`DELETE FROM connect_pc_jobs WHERE owner_user_id = $1 AND created_at < now() - interval '3 days'`, [ownerUserId]);
}

// ------------------------------------------------------------------ phone side (Vercel)

export async function workerFor(q: Q, ownerUserId: string): Promise<PcWorkerRow | null> {
  await ensurePcTables(q);
  const rows = await q(
    `SELECT owner_user_id, worker_id, label, version, providers, grok_bots, last_seen,
            (last_seen > now() - make_interval(secs => $2::int)) AS online
     FROM connect_pc_workers WHERE owner_user_id = $1`,
    [ownerUserId, ONLINE_WINDOW_SECONDS],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    owner_user_id: String(row.owner_user_id),
    worker_id: String(row.worker_id),
    label: (row.label as string | null) ?? null,
    version: (row.version as string | null) ?? null,
    providers: json<PcProviderInfo[]>(row.providers, []),
    grok_bots: json<PcGrokBot[]>(row.grok_bots, []),
    last_seen: new Date(row.last_seen as string).toISOString(),
    online: row.online === true || row.online === "t",
  };
}

export async function linkFor(q: Q, agentId: string): Promise<PcLink | null> {
  await ensurePcTables(q);
  const rows = await q(`SELECT agent_id, owner_user_id, provider, model, label, updated_at FROM connect_pc_agent_links WHERE agent_id = $1`, [agentId]);
  const row = rows[0];
  if (!row || !isPcProvider(row.provider)) return null;
  return { ...(row as PcLink), updated_at: new Date(row.updated_at as string).toISOString() };
}

export async function linksOf(q: Q, ownerUserId: string): Promise<PcLink[]> {
  await ensurePcTables(q);
  const rows = await q(`SELECT agent_id, owner_user_id, provider, model, label, updated_at FROM connect_pc_agent_links WHERE owner_user_id = $1`, [ownerUserId]);
  return rows.filter((row) => isPcProvider(row.provider)).map((row) => ({ ...(row as PcLink), updated_at: new Date(row.updated_at as string).toISOString() }));
}

export async function saveLink(q: Q, link: { agentId: string; ownerUserId: string; provider: PcProvider; model: string; label?: string | null }) {
  await ensurePcTables(q);
  await q(
    `INSERT INTO connect_pc_agent_links (agent_id, owner_user_id, provider, model, label, updated_at) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (agent_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, provider = EXCLUDED.provider, model = EXCLUDED.model, label = EXCLUDED.label, updated_at = now()`,
    [link.agentId, link.ownerUserId, link.provider, link.model, link.label ?? null],
  );
}

export async function removeLink(q: Q, agentId: string, ownerUserId: string) {
  await ensurePcTables(q);
  await q(`DELETE FROM connect_pc_agent_links WHERE agent_id = $1 AND owner_user_id = $2`, [agentId, ownerUserId]);
}

/** Only the owner of a private, not deleted agent may route it to their own PC. */
export async function ownsAgent(q: Q, agentId: string, userId: string): Promise<boolean> {
  const rows = await q(
    `SELECT 1 AS ok FROM agent_profiles WHERE agent_id = $1 AND owner_user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [agentId, userId],
  );
  return rows.length > 0;
}

export async function enqueueJob(q: Q, job: { id: string; ownerUserId: string; agentId: string; provider: PcProvider; model: string; prompt: string }) {
  await ensurePcTables(q);
  await q(
    `INSERT INTO connect_pc_jobs (id, owner_user_id, agent_id, provider, model, prompt) VALUES ($1, $2, $3, $4, $5, $6)`,
    [job.id, job.ownerUserId, job.agentId, job.provider, job.model, job.prompt],
  );
}

export async function readJob(q: Q, jobId: string): Promise<Pick<PcJob, "status" | "output" | "error"> | null> {
  const rows = await q(`SELECT status, output, error FROM connect_pc_jobs WHERE id = $1`, [jobId]);
  return (rows[0] as Pick<PcJob, "status" | "output" | "error"> | undefined) ?? null;
}

export async function cancelJob(q: Q, jobId: string) {
  await q(`UPDATE connect_pc_jobs SET status = 'cancelled', updated_at = now(), finished_at = now() WHERE id = $1 AND status IN ('queued', 'running')`, [jobId]);
}

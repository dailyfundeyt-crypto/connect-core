// sync-engine.ts - continuous TWO-WAY sync Connect App DB (127.0.0.1:5544) <-> Supabase (Vercel preview).
//
// State based (like git): data\sbsync\state.json remembers, per row, the hash each side had at the last
// successful sync (and for workspace values the agreed value = merge base). Per row:
//   changed on one side only            -> copy to the other side (insert/update), or delete there when it was
//                                          deleted (= tombstone in the state; the deleted row is archived first)
//   changed on both sides               -> workspace values: three-way merge (workspace-merge.ts);
//                                          rows: newer updated_at wins, the other version goes to conflicts\
//   deleted on one side, edited on other-> the edit wins, the row is restored (never lose newer data)
//   new on one side                     -> inserted on the other side
// Every write is guarded: the row must still have the hash seen when planning (SELECT ... FOR UPDATE),
// otherwise that side's transaction is rolled back and the run is retried (max 3x).
// Credentials are passed via env: SYNC_APP_URL, SYNC_SB_URL. Usage:
//   bun sync-engine.ts --state <dir> [--apply] [--quick]
//     --quick  only compare row hashes with the state; prints RESULT {"changed":false} when nothing changed
//     --apply  write (otherwise plan only = dry run)
import { SQL } from "bun";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, renameSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { mergeWorkspaceValue, sameWorkspaceValue } from "../../server/src/connect/workspace-merge.ts";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply"), QUICK = args.includes("--quick");
const STATE_DIR = opt("--state")!;
if (!STATE_DIR) throw new Error("--state <dir> fehlt");

// FK order (parents first). Chat tables are included automatically once they exist on BOTH sides.
const TABLES = ["agents", "agent_profiles", "channels", "channel_agents", "channel_memberships", "intelligence_channel_mappings",
  "agent_preferences", "user_instructions", "skills", "skill_tools", "routines", "connect_media", "connect_workspace_kv",
  "connect_chat_threads", "connect_chat_messages"];
const NOT_SYNCED: Record<string, string> = {
  users: "Benutzer: Zuordnung ueber gleiche ID/E-Mail, neue Konten entstehen beim Google-Login",
  accounts: "Login-Tokens", sessions: "Login-Sitzungen", verifications: "Login-Codes", user_roles: "Rollen pro Server (INITIAL_ADMIN_EMAILS)",
  audit_events: "Protokoll pro Server", work_items: "Warteschlange", routine_runs: "Laufprotokoll", routine_sweeps: "Laufprotokoll",
  components: "vom Server-Paket", deployment_packages: "vom Server-Paket", sandboxed_components: "vom Server-Paket",
  component_functions: "vom Server-Paket", credentials: "verschluesselt, KEY_ENCRYPTION_KEY verschieden",
  mcp_user_credentials: "verschluesselt", composio_connections: "Zugangsdaten", connect_mcp_servers: "nur lokal (Playwright-MCP dieses PCs)",
  connect_agent_mcp: "nur lokal", connect_agent_settings: "nur lokal", connect_drive_backup: "nur lokal (Drive-Sicherung)",
  attachments: "Dateien liegen im lokalen Speicher", computer_snapshot: "Laufzeit", computer_page_frame: "Laufzeit",
};
const TEST_RE = /persist(enz)?[-_ ]?test|app[-_ ]test/i;
const LEGACY_USERS = new Set(["dev-local-user"]);
const KV_LOCAL_KEYS = /:(connect\.account|connect\.sync-conflicts)$/; // per server, never synced
const USER_COLS = ["user_id", "owner_id", "created_by"];

type Side = "app" | "sb";
type St = { a: string; s: string; v?: unknown; skip?: true }; // skip: excluded row, hashes only ("" = absent)
type State = { version: 1; tables: Record<string, Record<string, St>>; lastSync?: string };
const statePath = join(STATE_DIR, "state.json");
mkdirSync(STATE_DIR, { recursive: true });
const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { version: 1, tables: {} };

function connect(url: string) {
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");
  const local = ["127.0.0.1", "localhost"].includes(u.hostname);
  return new SQL({
    hostname: u.hostname, port: Number(u.port || 5432), database: decodeURIComponent(u.pathname.slice(1)),
    username: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    tls: local || sslmode === "disable" ? false : true, max: 1, idleTimeout: 20, connectionTimeout: 20,
  });
}
const db: Record<Side, SQL> = { app: connect(process.env.SYNC_APP_URL!), sb: connect(process.env.SYNC_SB_URL!) };
// Every read runs with time zone UTC so timestamps render identically on both sides (pool size 1).
async function q(side: Side, text: string, params?: unknown[]): Promise<any[]> {
  await db[side].unsafe("set time zone 'UTC'");
  return (await (params ? db[side].unsafe(text, params as any[]) : db[side].unsafe(text))) as any[];
}
const ident = (s: string) => '"' + s.replace(/"/g, '""') + '"';

type Meta = { cols: string[]; pk: string[]; hasUpdated: boolean };
async function tableMeta(side: Side): Promise<Map<string, Meta>> {
  const rows = (await q(side, `select c.table_name t, c.column_name col, c.ordinal_position pos,
      coalesce(c.is_generated,'NEVER') gen, coalesce(c.identity_generation,'') idg,
      exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
             where i.indisprimary and i.indrelid=('public.'||quote_ident(c.table_name))::regclass and a.attname=c.column_name) pk
    from information_schema.columns c join pg_tables p on p.schemaname='public' and p.tablename=c.table_name
    where c.table_schema='public' order by c.table_name, c.ordinal_position`)) as any[];
  const m = new Map<string, Meta>();
  for (const r of rows) {
    if (!m.has(r.t)) m.set(r.t, { cols: [], pk: [], hasUpdated: false });
    const e = m.get(r.t)!;
    if (r.gen === "ALWAYS" || r.idg === "ALWAYS") continue;
    e.cols.push(r.col);
    if (r.pk) e.pk.push(r.col);
    if (r.col === "updated_at") e.hasUpdated = true;
  }
  return m;
}
const keyExpr = (pk: string[]) => `jsonb_build_array(${pk.map((c) => `x.${ident(c)}::text`).join(", ")})`;
async function hashes(side: Side, t: string, pk: string[]): Promise<Map<string, string>> {
  const rows = (await q(side, `select ${keyExpr(pk)}::text k, md5(to_jsonb(x)::text) h from public.${ident(t)} x`)) as any[];
  return new Map(rows.map((r) => [r.k, r.h]));
}
async function fetchRows(side: Side, t: string, pk: string[], keys: string[]): Promise<Map<string, any>> {
  if (!keys.length) return new Map();
  const rows = (await q(side, 
    `select ${keyExpr(pk)}::text k, to_jsonb(x)::text j from public.${ident(t)} x where ${keyExpr(pk)} = any(select jsonb_array_elements($1::text::jsonb))`,
    [JSON.stringify(keys.map((k) => JSON.parse(k)))])) as any[];
  return new Map(rows.map((r) => [r.k, JSON.parse(r.j)]));
}

// ---- workspace values: stored as jsonb strings holding JSON text; test entries stay local ----
function kvDecode(v: unknown): { v: unknown; str: boolean } {
  if (typeof v === "string") { const t = v.trim(); if (t.startsWith("{") || t.startsWith("[")) { try { return { v: JSON.parse(t), str: true }; } catch { /* plain */ } } }
  return { v, str: false };
}
const kvEncode = (v: unknown, str: boolean) => (str && v !== null && typeof v === "object" ? JSON.stringify(v) : v);
function dropTests(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => !TEST_RE.test(labelOf(x))).map(dropTests);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, dropTests(x)]));
  return v;
}
function labelOf(x: unknown): string {
  if (x && typeof x === "object") { const o = x as Record<string, unknown>; return [o.id, o.label, o.name].filter((y) => typeof y === "string").join(" "); }
  return typeof x === "string" ? x : "";
}
const kvView = (row: any) => dropTests(kvDecode(row.value).v); // what is compared / synced

// ---- logs ----
const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const conflictsDir = join(STATE_DIR, "conflicts"), tombDir = join(STATE_DIR, "tombstones");
mkdirSync(conflictsDir, { recursive: true }); mkdirSync(tombDir, { recursive: true });
const pendingConflicts: any[] = [], pendingTombs: any[] = [], notes = new Set<string>();

type Op = { side: Side; t: string; key: string; kind: "upsert" | "delete"; expect: string | null; row?: any; why: string };
type Next = St | null | { pending: true; aSeen: string | null; sSeen: string | null; v?: unknown };
type Plan = { ops: Op[]; next: Record<string, Record<string, Next>>; changedTables: string[] };

async function plan(): Promise<Plan | null> {
  const meta = { app: await tableMeta("app"), sb: await tableMeta("sb") };
  const users = {
    app: new Set(((await q("app", "select id from users")) as any[]).map((r) => r.id)),
    sb: new Set(((await q("sb", "select id from users")) as any[]).map((r) => r.id)),
  };
  for (const [t, why] of Object.entries(NOT_SYNCED)) if (meta.app.has(t) || meta.sb.has(t)) notes.add(`${t}: nicht synchronisiert (${why})`);
  for (const t of TABLES) {
    if (!meta.app.has(t) && !meta.sb.has(t)) { if (t.startsWith("connect_chat")) notes.add(`${t}: gibt es noch auf keiner Seite`); continue; }
    if (!meta.app.has(t) || !meta.sb.has(t)) notes.add(`${t}: fehlt ${meta.app.has(t) ? "online (Supabase)" : "in der App"} - uebersprungen bis beide Seiten die Tabelle haben`);
  }
  const tables = TABLES.filter((t) => meta.app.has(t) && meta.sb.has(t));
  const H: Record<string, { app: Map<string, string>; sb: Map<string, string> }> = {};
  const changedTables: string[] = [];
  for (const t of tables) {
    const pk = meta.sb.get(t)!.pk;
    if (!pk.length || pk.join() !== meta.app.get(t)!.pk.join()) { notes.add(`${t}: Primaerschluessel verschieden - uebersprungen`); continue; }
    H[t] = { app: await hashes("app", t, pk), sb: await hashes("sb", t, pk) };
    const st = state.tables[t] ?? {};
    const keys = new Set([...H[t].app.keys(), ...H[t].sb.keys()]);
    let changed = false;
    for (const k of keys) { const e = st[k]; if (!e || e.a !== (H[t].app.get(k) ?? "") || e.s !== (H[t].sb.get(k) ?? "")) { changed = true; break; } }
    for (const k of Object.keys(st)) if (!keys.has(k)) changed = true;
    if (changed) changedTables.push(t);
  }
  if (QUICK && !changedTables.length) return null;

  // test data, package rows (both sides)
  const testAgents = new Set<string>(), testChannels = new Set<string>(), pkgAgents = new Set<string>();
  for (const s of ["app", "sb"] as Side[]) {
    for (const a of (await q(s, "select id, name, package_id from agents")) as any[]) {
      if (TEST_RE.test(`${a.name ?? ""} ${a.id}`)) testAgents.add(a.id);
      if (a.package_id) pkgAgents.add(a.id);
    }
    for (const c of (await q(s, "select id, name from channels")) as any[]) if (TEST_RE.test(`${c.name ?? ""} ${c.id}`)) testChannels.add(c.id);
    for (const ca of (await q(s, "select channel_id, agent_id from channel_agents")) as any[]) if (testAgents.has(ca.agent_id)) testChannels.add(ca.channel_id);
  }
  const skipWhy = (t: string, r: any, target: Side): string | null => {
    if (t === "agents" && (testAgents.has(r.id) || r.package_id)) return r.package_id ? "Paket-Agent" : "Test-Agent";
    if (t === "channels" && (testChannels.has(r.id) || r.package_id)) return r.package_id ? "Paket-Kanal" : "Test-Kanal";
    if (t === "agent_profiles" && (pkgAgents.has(r.agent_id) || r.package_id)) return "Paket-Agent";
    if (r.agent_id && testAgents.has(r.agent_id)) return "Test-Agent";
    if (r.channel_id && testChannels.has(r.channel_id)) return "Test-Kanal";
    if (t === "connect_media" && TEST_RE.test(r.id)) return "Test-Bild";
    for (const c of USER_COLS) if (r[c] && (LEGACY_USERS.has(r[c]) || !users[target].has(r[c]))) return `Benutzer ${r[c]} gibt es auf der anderen Seite nicht`;
    if (t === "connect_workspace_kv") {
      const m = /^u:([^:]+):/.exec(r.key);
      if (!m) return "globaler Schalter pro Server";
      if (LEGACY_USERS.has(m[1]) || !users.app.has(m[1]) || !users.sb.has(m[1])) return "Benutzer nicht auf beiden Seiten";
      if (KV_LOCAL_KEYS.test(r.key)) return "pro Server";
      const v = kvDecode(r.value).v as any;
      if (v && typeof v === "object" && !Array.isArray(v) && TEST_RE.test(labelOf(v))) return "Testprofil";
    }
    return null;
  };

  const ops: Op[] = [], next: Plan["next"] = {};
  for (const t of changedTables) {
    const m = meta.sb.get(t)!, pk = m.pk, kv = t === "connect_workspace_kv";
    const common = m.cols.filter((c) => meta.app.get(t)!.cols.includes(c));
    const st = state.tables[t] ?? {};
    const hA = H[t].app, hS = H[t].sb;
    const keys = [...new Set([...hA.keys(), ...hS.keys(), ...Object.keys(st)])];
    const need = keys.filter((k) => { const e = st[k]; return !e || e.a !== (hA.get(k) ?? "") || e.s !== (hS.get(k) ?? ""); });
    const rowsA = await fetchRows("app", t, pk, need.filter((k) => hA.has(k)));
    const rowsS = await fetchRows("sb", t, pk, need.filter((k) => hS.has(k)));
    next[t] = {};
    const pick = (r: any) => Object.fromEntries(common.filter((c) => c in r).map((c) => [c, r[c]]));
    const same = (a: any, b: any) => (kv ? sameWorkspaceValue(kvView(a), kvView(b)) : sameWorkspaceValue(pick(a), pick(b)));
    const newer = (a: any, b: any) => (Date.parse(a?.updated_at ?? "") || 0) >= (Date.parse(b?.updated_at ?? "") || 0);
    const conflict = (k: string, what: string, kept: any, lost: any) => pendingConflicts.push({ at: new Date().toISOString(), table: t, key: k, what, kept, lost });
    // row to write on `target`, derived from `src` (workspace values: test entries of the target are kept)
    const rowFor = (target: Side, k: string, src: any, value?: unknown, now?: boolean) => {
      const r = pick(src);
      if (kv) {
        const cur = target === "app" ? rowsA.get(k) : rowsS.get(k);
        const base = cur ? kvDecode(cur.value) : kvDecode(src.value);
        let v = value === undefined ? kvView(src) : value;
        if (cur && target === "app") v = mergeWorkspaceValue(kvView(cur), kvDecode(cur.value).v, v).value; // keep local test entries
        r.value = kvEncode(v, base.str);
        if (now) r.updated_at = new Date().toISOString();
      }
      return r;
    };
    // agreed value after this run (workspace values: merge base for the next run)
    const pend = (k: string, v?: unknown) => {
      const cur = next[t][k] as any;
      next[t][k] = { pending: true, aSeen: hA.get(k) ?? null, sSeen: hS.get(k) ?? null, v: v !== undefined ? v : cur?.v };
    };
    const put = (side: Side, k: string, row: any, why: string, v?: unknown) => {
      ops.push({ side, t, key: k, kind: "upsert", expect: (side === "app" ? hA : hS).get(k) ?? null, row, why });
      pend(k, kv ? (v !== undefined ? v : dropTests(kvDecode(row.value).v)) : undefined);
    };
    const del = (side: Side, k: string, why: string) => {
      ops.push({ side, t, key: k, kind: "delete", expect: (side === "app" ? hA : hS).get(k) ?? null, why });
      pend(k);
    };

    for (const k of need) {
      const A = rowsA.get(k), S = rowsS.get(k);
      const skip = (A && skipWhy(t, A, "sb")) || (S && skipWhy(t, S, "app"));
      if (skip) { next[t][k] = { a: hA.get(k) ?? "", s: hS.get(k) ?? "", skip: true }; notes.add(`${t} ${k}: ${skip} - nicht synchronisiert`); continue; }
      const e = st[k]?.skip ? undefined : st[k]; // excluded before, eligible now: treat as new
      if (!e) {
        if (!A && !S) { next[t][k] = null; continue; }
        if (A && S) {
          if (same(A, S)) { next[t][k] = { a: hA.get(k)!, s: hS.get(k)!, v: kv ? kvView(A) : undefined }; continue; }
          if (kv) {
            const [older, nw] = newer(A, S) ? [S, A] : [A, S];
            const r = mergeWorkspaceValue(undefined, kvView(older), kvView(nw));
            if (r.conflicts.length) conflict(k, "erster Abgleich, beide verschieden: zusammengefuehrt", r.value, r.conflicts);
            if (!sameWorkspaceValue(kvView(A), r.value)) put("app", k, rowFor("app", k, A, r.value, true), "zusammengefuehrt", r.value);
            if (!sameWorkspaceValue(kvView(S), r.value)) put("sb", k, rowFor("sb", k, S, r.value, true), "zusammengefuehrt", r.value);
          } else if (newer(A, S)) { conflict(k, "beide verschieden, App neuer", A, S); put("sb", k, pick(A), "App neuer"); }
          else { conflict(k, "beide verschieden, online neuer", S, A); put("app", k, pick(S), "online neuer"); }
        } else if (A) put("sb", k, rowFor("sb", k, A), "neu in der App");
        else if (S) put("app", k, rowFor("app", k, S), "neu online", kv ? kvView(S) : undefined);
        continue;
      }
      const cA = e.a !== hA.get(k) && !(kv && A && sameWorkspaceValue(kvView(A), e.v));
      const cS = e.s !== hS.get(k) && !(kv && S && sameWorkspaceValue(kvView(S), e.v));
      if (!cA && !cS) { next[t][k] = { a: hA.get(k)!, s: hS.get(k)!, v: e.v }; continue; }
      if (cA && !cS) {
        if (!A) del("sb", k, "in der App geloescht");
        else put("sb", k, rowFor("sb", k, A), "in der App geaendert");
      } else if (cS && !cA) {
        if (!S) del("app", k, "online geloescht");
        else put("app", k, rowFor("app", k, S), "online geaendert", kv ? kvView(S) : undefined);
      } else if (!A && !S) next[t][k] = null;
      else if (!A) { conflict(k, "in der App geloescht, online geaendert -> wiederhergestellt", S, null); put("app", k, rowFor("app", k, S), "Aenderung schlaegt Loeschung", kv ? kvView(S) : undefined); }
      else if (!S) { conflict(k, "online geloescht, in der App geaendert -> wiederhergestellt", A, null); put("sb", k, rowFor("sb", k, A), "Aenderung schlaegt Loeschung"); }
      else if (same(A, S)) next[t][k] = { a: hA.get(k)!, s: hS.get(k)!, v: kv ? kvView(A) : undefined };
      else if (kv) {
        const [older, nw] = newer(A, S) ? [S, A] : [A, S];
        const r = mergeWorkspaceValue(e.v, kvView(older), kvView(nw));
        if (r.conflicts.length) conflict(k, "beide geaendert: zusammengefuehrt", r.value, r.conflicts);
        if (!sameWorkspaceValue(kvView(A), r.value)) put("app", k, rowFor("app", k, A, r.value, true), "zusammengefuehrt", r.value);
        if (!sameWorkspaceValue(kvView(S), r.value)) put("sb", k, rowFor("sb", k, S, r.value, true), "zusammengefuehrt", r.value);
      } else if (newer(A, S)) { conflict(k, "beide geaendert, App neuer", A, S); put("sb", k, pick(A), "beide geaendert, App neuer"); }
      else { conflict(k, "beide geaendert, online neuer", S, A); put("app", k, pick(S), "beide geaendert, online neuer"); }
    }
  }
  return { ops, next, changedTables };
}

class GuardError extends Error {}
async function applySide(side: Side, ops: Op[], meta: Map<string, Meta>, written: Map<string, string | null>, failed: Op[]) {
  if (!ops.length) return;
  const order = (o: Op) => (o.kind === "delete" ? -1000 + -TABLES.indexOf(o.t) : TABLES.indexOf(o.t));
  ops.sort((a, b) => order(a) - order(b));
  await db[side].begin(async (tx) => {
    await tx.unsafe("set local time zone 'UTC'");
    for (const o of ops) {
      const pk = meta.get(o.t)!.pk;
      const where = `${keyExpr(pk)} = $1::text::jsonb`;
      const cur = (await tx.unsafe(`select md5(to_jsonb(x)::text) h, to_jsonb(x)::text j from public.${ident(o.t)} x where ${where} for update`, [o.key])) as any[];
      const h = cur[0]?.h ?? null;
      if (h !== o.expect) throw new GuardError(`${side} ${o.t} ${o.key} wurde waehrend des Abgleichs geaendert`);
      await tx.unsafe("savepoint op");
      try {
        if (o.kind === "delete") {
          if (cur[0]) {
            await tx.unsafe(`delete from public.${ident(o.t)} x where ${where}`, [o.key]);
            pendingTombs.push({ at: new Date().toISOString(), side, table: o.t, key: o.key, why: o.why, row: JSON.parse(cur[0].j) });
          }
          written.set(`${side}|${o.t}|${o.key}`, null);
        } else {
          const cols = Object.keys(o.row).filter((c) => meta.get(o.t)!.cols.includes(c));
          const list = cols.map(ident).join(", ");
          const upd = cols.filter((c) => !pk.includes(c));
          const set = (upd.length ? upd : pk).map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ");
          const r = (await tx.unsafe(`insert into public.${ident(o.t)} as x (${list}) select ${list} from jsonb_populate_record(null::public.${ident(o.t)}, $1::text::jsonb)
             on conflict (${pk.map(ident).join(", ")}) do update set ${set} returning md5(to_jsonb(x)::text) h`, [JSON.stringify(o.row)])) as any[];
          written.set(`${side}|${o.t}|${o.key}`, r[0].h);
        }
        await tx.unsafe("release savepoint op");
      } catch (err) {
        await tx.unsafe("rollback to savepoint op");
        failed.push(o);
        pendingConflicts.push({ at: new Date().toISOString(), table: o.t, key: o.key, what: `${side}: Schreiben fehlgeschlagen (${String((err as Error).message)}) - Zeile bleibt auf der anderen Seite, naechster Lauf versucht es erneut`, kept: o.row ?? null, lost: null });
      }
    }
  });
}

function flushFiles() {
  for (const c of pendingConflicts) appendFileSync(join(conflictsDir, `conflicts-${day}.jsonl`), JSON.stringify(c) + "\n");
  for (const c of pendingTombs) appendFileSync(join(tombDir, `deleted-${day}.jsonl`), JSON.stringify(c) + "\n");
  const cut = Date.now() - 30 * 86400e3;
  for (const d of [conflictsDir, tombDir]) for (const f of readdirSync(d)) if (statSync(join(d, f)).mtimeMs < cut) unlinkSync(join(d, f));
}

async function main() {
  let result: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    pendingConflicts.length = 0; pendingTombs.length = 0;
    const p = await plan();
    if (!p) { result = { changed: false, ops: 0 }; break; }
    const summary = p.ops.map((o) => `${o.side === "app" ? "-> App" : "-> online"} ${o.kind} ${o.t} ${o.key} (${o.why})`);
    if (!APPLY) { result = { changed: true, dryRun: true, ops: p.ops.length, opsList: summary, conflicts: pendingConflicts.length, tables: p.changedTables }; break; }
    const written = new Map<string, string | null>(), failed: Op[] = [];
    const meta = { app: await tableMeta("app"), sb: await tableMeta("sb") };
    try {
      await applySide("sb", p.ops.filter((o) => o.side === "sb"), meta.sb, written, failed);
      await applySide("app", p.ops.filter((o) => o.side === "app"), meta.app, written, failed);
    } catch (err) {
      if (err instanceof GuardError && attempt < 3) { console.log(`RETRY ${attempt}: ${err.message}`); await Bun.sleep(1500); continue; }
      throw err;
    }
    // new state: what both sides hold now (written hash for the side we wrote, seen hash for the other)
    const failedKeys = new Set(failed.map((o) => `${o.t}|${o.key}`));
    for (const t of Object.keys(p.next)) {
      const st = (state.tables[t] ??= {});
      for (const [k, e] of Object.entries(p.next[t])) {
        if (e === null) { delete st[k]; continue; }
        if (!(e as any).pending) { st[k] = e as St; continue; }
        if (failedKeys.has(`${t}|${k}`)) continue; // keep old state, retried next run
        const x = e as { aSeen: string | null; sSeen: string | null; v?: unknown };
        const a = written.has(`app|${t}|${k}`) ? written.get(`app|${t}|${k}`)! : x.aSeen;
        const s2 = written.has(`sb|${t}|${k}`) ? written.get(`sb|${t}|${k}`)! : x.sSeen;
        if (a == null || s2 == null) { delete st[k]; continue; } // deleted on both sides now
        st[k] = { a, s: s2, ...(x.v !== undefined ? { v: x.v } : {}) };
      }
    }
    state.lastSync = new Date().toISOString();
    writeFileSync(statePath + ".tmp", JSON.stringify(state));
    renameSync(statePath + ".tmp", statePath);
    result = { changed: true, ops: p.ops.length, failed: failed.length, opsList: summary, conflicts: pendingConflicts.length, deleted: pendingTombs.length, tables: p.changedTables };
    break;
  }
  flushFiles();
  result.notes = [...notes];
  console.log("RESULT " + JSON.stringify(result));
  for (const s of ["app", "sb"] as Side[]) await db[s].close();
}
main().catch(async (err) => {
  console.log("ERROR " + String(err?.stack || err));
  try { flushFiles(); } catch { /* ignore */ }
  process.exit(2);
});

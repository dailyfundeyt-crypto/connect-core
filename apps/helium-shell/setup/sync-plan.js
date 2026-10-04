// sync-plan.js - plans an ADDITIVE merge App DB (5544) -> Supabase. Reads JSON exports, writes sync.sql,
// conflicts.json and report.json. Never deletes. Re-runnable: a second run after COMMIT produces 0 operations.
// Usage: bun sync-plan.js <exportDir> <outDir> <commit:0|1>
const fs = require("fs"), path = require("path");
const [dir, out, commitFlag] = process.argv.slice(2);
const L = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8").replace(/^\uFEFF/, "").trim() || "[]");
const exists = (f) => fs.existsSync(path.join(dir, f));
const TEST_RE = /persist(enz)?[-_ ]?test|app[-_ ]test/i;
const SYNC_TABLES = ["users", "agents", "agent_profiles", "channels", "channel_agents", "channel_memberships",
  "intelligence_channel_mappings", "connect_media", "connect_workspace_kv"];
// Not synced on purpose (reported): auth/session data, config-governed roles, logs, job queue, package-seeded
// rows, local-only runtime tables, encrypted credential stores.
const SKIP_TABLES = {
  accounts: "Login-Tokens (Google) - bleiben pro Server", sessions: "Login-Sitzungen", verifications: "Login-Codes",
  user_roles: "Rolle kommt aus INITIAL_ADMIN_EMAILS des jeweiligen Servers", audit_events: "Protokoll, pro Server",
  work_items: "Server-Warteschlange", components: "vom Server-Paket angelegt", deployment_packages: "vom Server-Paket angelegt",
  connect_mcp_servers: "lokale MCP-Server (Playwright auf diesem PC), Tabelle gibt es online nicht",
  connect_agent_mcp: "lokale MCP-Zuordnung, Tabelle gibt es online nicht", connect_agent_settings: "lokal",
  connect_drive_backup: "lokal", credentials: "verschluesselt mit anderem KEY_ENCRYPTION_KEY",
  mcp_user_credentials: "verschluesselt", composio_connections: "Zugangsdaten",
};
const LEGACY_USERS = new Set(["dev-local-user"]); // old single-user identity, its data is already merged into Xx3D

const meta = { app: {}, sb: {} };
for (const s of ["app", "sb"]) for (const c of L(`${s}-meta.json`)) (meta[s][c.t] ||= []).push(c);
const pk = (t) => (meta.sb[t] || []).filter((c) => c.pk).map((c) => c.col);
const ops = [], conflicts = [], skipped = [], notes = [];
const stamp = path.basename(out);

// ---------- user mapping by e-mail ----------
const appUsers = L("app-users.json"), sbUsers = L("sb-users.json");
const sbByEmail = new Map(sbUsers.map((u) => [String(u.email).toLowerCase(), u]));
const userMap = new Map(); // app id -> sb id
for (const u of appUsers) {
  const m = sbByEmail.get(String(u.email).toLowerCase());
  if (m) userMap.set(u.id, m.id);
}
const mapUser = (id) => userMap.get(id) ?? id;

// ---------- test data ----------
const testAgents = new Set(), testChannels = new Set();
for (const a of L("app-agents.json")) if (TEST_RE.test(a.name || "") || TEST_RE.test(a.id)) testAgents.add(a.id);
for (const c of L("app-channels.json")) if (TEST_RE.test(c.name || "") || TEST_RE.test(c.id)) testChannels.add(c.id);
for (const ca of L("app-channel_agents.json")) if (testAgents.has(ca.agent_id)) testChannels.add(ca.channel_id);
function isTestRow(t, r) {
  if (t === "users") return LEGACY_USERS.has(r.id) ? "alte Einzelbenutzer-Identitaet (Daten liegen schon bei dailyfunde.yt)" : null;
  if (r.agent_id && testAgents.has(r.agent_id)) return "Test-Agent";
  if (t === "agents" && testAgents.has(r.id)) return "Test-Agent";
  if (r.channel_id && testChannels.has(r.channel_id)) return "Test-Kanal";
  if (t === "channels" && testChannels.has(r.id)) return "Test-Kanal";
  if (t === "connect_media" && TEST_RE.test(r.id)) return "Test-Bild";
  if (r.user_id && LEGACY_USERS.has(r.user_id)) return "alte Einzelbenutzer-Identitaet";
  return null;
}
function filterTest(v, where) { // removes clearly-test items from arrays inside a kv value
  if (Array.isArray(v)) {
    const keep = [];
    for (const x of v) {
      const label = x && typeof x === "object" ? [x.id, x.label, x.name].filter(Boolean).join(" ") : typeof x === "string" ? x : "";
      if (label && TEST_RE.test(label)) { skipped.push({ table: "connect_workspace_kv", key: where, item: label, reason: "Testeintrag" }); continue; }
      keep.push(filterTest(x, where));
    }
    return keep;
  }
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = filterTest(x, where); return o; }
  return v;
}

// ---------- deep merge (additive; scalars: newer side wins, loser logged) ----------
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isIdArray = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => x && typeof x === "object" && !Array.isArray(x) && "id" in x);
function merge(sbV, appV, appNewer, p, log) {
  if (eq(sbV, appV)) return sbV;
  if (sbV === undefined) return appV;
  if (appV === undefined) return sbV;
  if (Array.isArray(sbV) && Array.isArray(appV)) {
    if ((isIdArray(sbV) || sbV.length === 0) && (isIdArray(appV) || appV.length === 0)) {
      const res = sbV.map((s) => { const a = appV.find((x) => x.id === s.id); return a ? merge(s, a, appNewer, `${p}[id=${s.id}]`, log) : s; });
      for (const a of appV) if (!sbV.some((s) => s.id === a.id)) res.push(a);
      return res;
    }
    if (sbV.every((x) => typeof x !== "object") && appV.every((x) => typeof x !== "object")) {
      return [...sbV, ...appV.filter((x) => !sbV.includes(x))];
    }
  } else if (sbV && appV && typeof sbV === "object" && typeof appV === "object" && !Array.isArray(sbV) && !Array.isArray(appV)) {
    const res = {};
    for (const k of new Set([...Object.keys(sbV), ...Object.keys(appV)])) res[k] = merge(sbV[k], appV[k], appNewer, `${p}.${k}`, log);
    return res;
  }
  const win = appNewer ? appV : sbV, lose = appNewer ? sbV : appV;
  log.push({ path: p, kept: appNewer ? "app (neuer)" : "supabase (neuer)", keptValue: win, lostValue: lose });
  return win;
}

// ---------- SQL helpers ----------
function lit(s) { let tag = "j"; while (s.includes(`$${tag}$`)) tag += "x"; return `$${tag}$${s}$${tag}$`; }
const ident = (s) => '"' + s.replace(/"/g, '""') + '"';
const whereOf = (t, r) => pk(t).map((c) => `${ident(c)} = (jsonb_populate_record(NULL::public.${ident(t)}, ${lit(JSON.stringify(r))}::jsonb)).${ident(c)}`).join(" AND ");
const keyOf = (t, r) => pk(t).map((c) => String(r[c])).join("|");
const ts = (x) => (x ? Date.parse(x) : NaN);

// ---------- rows ----------
for (const t of SYNC_TABLES) {
  if (!exists(`app-${t}.json`) || !exists(`sb-${t}.json`)) { notes.push(`${t}: Tabelle fehlt auf einer Seite - uebersprungen`); continue; }
  let appRows = L(`app-${t}.json`);
  const sbRows = L(`sb-${t}.json`);
  const sbMap = new Map(sbRows.map((r) => [keyOf(t, r), r]));
  for (let r of appRows) {
    const why = isTestRow(t, r);
    if (why) { skipped.push({ table: t, key: keyOf(t, r), name: r.name || r.email || r.title || undefined, reason: why }); continue; }
    if (t !== "users") { r = { ...r }; for (const c of ["user_id", "owner_id", "created_by"]) if (r[c]) r[c] = mapUser(r[c]); }
    if (t === "connect_workspace_kv") {
      const m = /^u:([^:]+):(.*)$/.exec(r.key);
      if (m) {
        const uid = mapUser(m[1]);
        if (LEGACY_USERS.has(m[1]) || !sbUsers.some((u) => u.id === uid)) { skipped.push({ table: t, key: r.key, reason: LEGACY_USERS.has(m[1]) ? "alte Einzelbenutzer-Identitaet (schon bei dailyfunde.yt eingemischt)" : "Benutzer gibt es online nicht" }); continue; }
        r.key = `u:${uid}:${m[2]}`;
      }
    }
    if ((t === "agents" || t === "agent_profiles" || t === "channels") && r.package_id) { notes.push(`${t} ${keyOf(t, r)}: vom Server-Paket verwaltet - nicht synchronisiert`); continue; }
    if (t === "agent_profiles" && L("app-agents.json").some((a) => a.id === r.agent_id && a.package_id)) { notes.push(`agent_profiles ${r.agent_id}: Paket-Agent - nicht synchronisiert`); continue; }
    const k = keyOf(t, r), s = sbMap.get(k);
    if (t === "connect_workspace_kv") {
      const asStr = typeof r.value === "string";
      let av; try { av = asStr ? JSON.parse(r.value) : r.value; } catch { av = r.value; }
      if (av && typeof av === "object" && !Array.isArray(av) && TEST_RE.test([av.id, av.name, av.label].filter(Boolean).join(" "))) { skipped.push({ table: t, key: r.key, reason: "Testprofil (App-Test)" }); continue; }
      av = filterTest(av, r.key);
      const enc = (v, likeStr) => (likeStr && typeof v !== "string" ? JSON.stringify(v) : v);
      if (!s) { ops.push({ t, kind: "insert", key: k, row: { ...r, value: enc(av, asStr) } }); continue; }
      const sStr = typeof s.value === "string";
      let sv; try { sv = sStr ? JSON.parse(s.value) : s.value; } catch { sv = s.value; }
      const log = [];
      const merged = merge(sv, av, ts(r.updated_at) > ts(s.updated_at), "", log);
      if (eq(merged, sv)) continue;
      conflicts.push({ table: t, key: k, supabaseBefore: s.value, supabaseUpdatedAt: s.updated_at, appValue: r.value, appUpdatedAt: r.updated_at, scalarDecisions: log });
      ops.push({ t, kind: "kv-update", key: k, seen: s.updated_at, value: enc(merged, sStr) });
      continue;
    }
    if (!s) { ops.push({ t, kind: "insert", key: k, row: r }); continue; }
    if (t === "users") continue; // never touch existing online users (sign-in data)
    const diffCols = Object.keys(r).filter((c) => !eq(r[c], s[c]));
    if (!diffCols.length) continue;
    const appNewer = ts(r.updated_at) > ts(s.updated_at);
    if (!appNewer) { conflicts.push({ table: t, key: k, kept: "supabase (neuer oder gleich alt)", lostAppRow: r, columns: diffCols }); continue; }
    conflicts.push({ table: t, key: k, kept: "app (neuer)", lostSupabaseRow: s, columns: diffCols });
    ops.push({ t, kind: "row-update", key: k, seen: s.updated_at, row: r, cols: diffCols });
  }
}
for (const [t, why] of Object.entries(SKIP_TABLES)) if (exists(`app-${t}.json`)) { const n = L(`app-${t}.json`).length; if (n) notes.push(`${t}: ${n} Zeile(n) lokal, nicht synchronisiert (${why})`); }

// ---------- SQL ----------
const order = ["users", "agents", "agent_profiles", "channels", "channel_agents", "channel_memberships", "intelligence_channel_mappings", "connect_media", "connect_workspace_kv"];
ops.sort((a, b) => order.indexOf(a.t) - order.indexOf(b.t));
let sql = `\\set ON_ERROR_STOP on\nSET client_min_messages = notice;\nBEGIN;\nCREATE TEMP TABLE _sync_n (t text, kind text, n int) ON COMMIT DROP;\n`;
for (const o of ops) {
  if (o.kind === "insert") {
    sql += `WITH i AS (INSERT INTO public.${ident(o.t)} SELECT * FROM jsonb_populate_record(NULL::public.${ident(o.t)}, ${lit(JSON.stringify(o.row))}::jsonb) ON CONFLICT DO NOTHING RETURNING 1) INSERT INTO _sync_n SELECT '${o.t}','insert', count(*) FROM i;\n`;
  } else if (o.kind === "kv-update") {
    const v = typeof o.value === "string" ? `to_jsonb(${lit(o.value)}::text)` : `${lit(JSON.stringify(o.value))}::jsonb`;
    sql += `DO $do$ DECLARE c int; BEGIN UPDATE public.connect_workspace_kv SET value = ${v}, updated_at = now() WHERE key = ${lit(o.key)} AND updated_at = ${lit(o.seen)}::timestamptz; GET DIAGNOSTICS c = ROW_COUNT; IF c <> 1 THEN RAISE EXCEPTION 'Supabase-Wert % wurde inzwischen geaendert - Abbruch, nichts geschrieben. Neu starten.', ${lit(o.key)}; END IF; INSERT INTO _sync_n VALUES ('connect_workspace_kv','update',1); END $do$;\n`;
  } else if (o.kind === "row-update") {
    const rec = `(jsonb_populate_record(NULL::public.${ident(o.t)}, ${lit(JSON.stringify(o.row))}::jsonb))`;
    const sets = o.cols.map((c) => `${ident(c)} = ${rec}.${ident(c)}`).join(", ");
    sql += `DO $do$ DECLARE c int; BEGIN UPDATE public.${ident(o.t)} SET ${sets} WHERE ${whereOf(o.t, o.row)} AND updated_at = ${lit(o.seen)}::timestamptz; GET DIAGNOSTICS c = ROW_COUNT; IF c <> 1 THEN RAISE EXCEPTION 'Supabase-Zeile %.% wurde inzwischen geaendert - Abbruch.', '${o.t}', ${lit(o.key)}; END IF; INSERT INTO _sync_n VALUES ('${o.t}','update',1); END $do$;\n`;
  }
}
const expect = {};
for (const o of ops) { const k = `${o.t}:${o.kind === "insert" ? "insert" : "update"}`; expect[k] = (expect[k] || 0) + 1; }
const ev = Object.entries(expect).map(([k, n]) => `('${k}', ${n})`).join(", ") || "('none:none', 0)";
sql += `DO $do$ DECLARE r record; bad text := ''; BEGIN
  FOR r IN SELECT e.k, e.n AS want, coalesce((SELECT sum(n) FROM _sync_n s WHERE s.t || ':' || s.kind = e.k), 0) AS got FROM (VALUES ${ev}) e(k, n) LOOP
    RAISE NOTICE 'CHECK % = % (erwartet %)', r.k, r.got, r.want;
    IF r.k <> 'none:none' AND r.got <> r.want THEN bad := bad || r.k || ' '; END IF;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'Sync-Pruefung fehlgeschlagen: %', bad; END IF;
  RAISE NOTICE 'SYNC OK (% Operationen)', ${ops.length};
END $do$;\n${commitFlag === "1" ? "COMMIT;" : "ROLLBACK;"}\n`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "sync.sql"), sql);
fs.writeFileSync(path.join(out, "conflicts.json"), JSON.stringify(conflicts, null, 2));
const report = { ops: ops.map((o) => ({ table: o.t, kind: o.kind, key: o.key })), skipped, notes, userMap: Object.fromEntries(userMap) };
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(`PLAN ops=${ops.length} conflicts=${conflicts.length} skipped=${skipped.length}`);
for (const o of report.ops) console.log(`  ${o.kind.padEnd(10)} ${o.table} ${o.key}`);
for (const s of skipped) console.log(`  SKIP ${s.table} ${s.key}${s.item ? " -> " + s.item : ""}${s.name ? " (" + s.name + ")" : ""}: ${s.reason}`);
for (const n of notes) console.log(`  NOTE ${n}`);

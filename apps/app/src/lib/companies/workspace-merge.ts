/**
 * Three-way merge for Connect workspace values (companies, projects, Lab browser, …).
 *
 * Shared by the browser (workspace-sync.ts), the server (`PUT /api/connect/workspace`) and the
 * App <-> Supabase sync (apps/helium-shell/setup/sync-engine.ts). Keep the copies identical.
 *
 *   base     = the value both sides last agreed on (undefined = unknown -> plain union, nothing deleted)
 *   current  = the value stored now (server / other database)
 *   incoming = the newer edit (browser push / newer side)
 *
 * Rules: unchanged side takes the other side's value. Changed on both sides: objects merge per key,
 * arrays of {id} objects and arrays of primitives merge per element. An element/key missing on one
 * side counts as deleted only when the base had it and the other side did not change it; otherwise it
 * is kept (an edit beats a delete). Scalar conflicts: incoming wins, the losing value is reported.
 */
export type MergeConflict = { path: string; kept: unknown; lost: unknown; reason: string };

export function decodeWorkspaceValue(value: unknown): unknown {
  if (typeof value === "string") {
    const t = value.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return JSON.parse(t) as unknown;
      } catch {
        return value;
      }
    }
  }
  return value;
}

function canon(v: unknown): unknown {
  const d = decodeWorkspaceValue(v);
  if (Array.isArray(d)) return d.map(canon);
  if (d && typeof d === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(d as Record<string, unknown>).sort()) o[k] = canon((d as Record<string, unknown>)[k]);
    return o;
  }
  return d;
}

export function sameWorkspaceValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canon(a) ?? null) === JSON.stringify(canon(b) ?? null);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idOf = (v: unknown): string | null => {
  if (!isObj(v)) return null;
  const id = v.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
};
const isIdArray = (v: unknown): v is unknown[] => Array.isArray(v) && v.every((x) => idOf(x) !== null);
const isPrimArray = (v: unknown): v is unknown[] => Array.isArray(v) && v.every((x) => x === null || typeof x !== "object");

function mergeKeyed(
  base: Map<string, unknown> | undefined,
  cur: Map<string, unknown>,
  inc: Map<string, unknown>,
  path: string,
  out: MergeConflict[],
): Map<string, unknown> {
  const res = new Map<string, unknown>();
  const keys = [...inc.keys(), ...[...cur.keys()].filter((k) => !inc.has(k))];
  for (const k of keys) {
    const inC = cur.has(k), inI = inc.has(k), inB = !!base && base.has(k);
    const p = `${path}/${k}`;
    if (inC && inI) {
      res.set(k, merge3(inB ? base!.get(k) : undefined, cur.get(k), inc.get(k), p, out));
    } else if (inI) {
      if (inB && sameWorkspaceValue(base!.get(k), inc.get(k))) continue; // deleted on the other side
      if (inB) out.push({ path: p, kept: inc.get(k), lost: undefined, reason: "andere Seite geloescht, hier geaendert -> behalten" });
      res.set(k, inc.get(k));
    } else {
      if (inB && sameWorkspaceValue(base!.get(k), cur.get(k))) continue; // deleted by incoming
      if (inB) out.push({ path: p, kept: cur.get(k), lost: undefined, reason: "hier geloescht, andere Seite geaendert -> behalten" });
      res.set(k, cur.get(k));
    }
  }
  return res;
}

function merge3(base: unknown, cur: unknown, inc: unknown, path: string, out: MergeConflict[]): unknown {
  if (sameWorkspaceValue(cur, inc)) return cur;
  if (base !== undefined) {
    if (sameWorkspaceValue(base, inc)) return cur;
    if (sameWorkspaceValue(base, cur)) return inc;
  }
  if (cur === undefined) return inc;
  if (inc === undefined) return cur;
  if (isObj(cur) && isObj(inc)) {
    const m = mergeKeyed(
      isObj(base) ? new Map(Object.entries(base)) : undefined,
      new Map(Object.entries(cur)),
      new Map(Object.entries(inc)),
      path,
      out,
    );
    return Object.fromEntries(m);
  }
  if (isIdArray(cur) && isIdArray(inc) && (cur.length > 0 || inc.length > 0)) {
    const toMap = (a: unknown[]) => new Map(a.map((x) => [idOf(x)!, x] as [string, unknown]));
    const m = mergeKeyed(isIdArray(base) ? toMap(base) : undefined, toMap(cur), toMap(inc), path, out);
    return [...m.values()];
  }
  if (isPrimArray(cur) && isPrimArray(inc)) {
    const key = (x: unknown) => JSON.stringify(x);
    const toMap = (a: unknown[]) => new Map(a.map((x) => [key(x), x] as [string, unknown]));
    const m = mergeKeyed(isPrimArray(base) ? toMap(base) : undefined, toMap(cur), toMap(inc), path, out);
    return [...m.values()];
  }
  out.push({ path: path || "/", kept: inc, lost: cur, reason: "beide geaendert -> neuere Version" });
  return inc;
}

/** Merge one workspace key. Values may be JSON text (as stored) or parsed; the result is parsed. */
export function mergeWorkspaceValue(
  base: unknown,
  current: unknown,
  incoming: unknown,
): { value: unknown; conflicts: MergeConflict[] } {
  const conflicts: MergeConflict[] = [];
  const value = merge3(
    base === undefined ? undefined : decodeWorkspaceValue(base),
    decodeWorkspaceValue(current),
    decodeWorkspaceValue(incoming),
    "",
    conflicts,
  );
  return { value, conflicts };
}

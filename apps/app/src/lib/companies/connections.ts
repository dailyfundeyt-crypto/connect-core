/**
 * Company↔company connections. Every edge MUST name the product that binds them.
 * Local-first until Supabase; feeds the cross-company graph on L1.
 */

export type CompanyConnection = {
  id: string;
  /** Undirected edge — always stored with fromId < toId for uniqueness. */
  fromId: string;
  toId: string;
  /** Required: which product ties these companies together. */
  product: string;
  note?: string;
  createdAt: string;
};

const KEY = "connect.company-connections";

function readAll(): CompanyConnection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CompanyConnection[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: CompanyConnection[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("connect-connections-changed"));
}

function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function listConnections(companyId?: string): CompanyConnection[] {
  const all = readAll();
  if (!companyId) return all;
  return all.filter((c) => c.fromId === companyId || c.toId === companyId);
}

export function createConnection(input: {
  fromId: string;
  toId: string;
  product: string;
  note?: string;
}): CompanyConnection {
  const product = input.product.trim();
  if (!product) throw new Error("Product is required for a company connection.");
  if (input.fromId === input.toId) {
    throw new Error("A company cannot connect to itself.");
  }
  const [fromId, toId] = normalizePair(input.fromId, input.toId);
  const existing = readAll().find(
    (c) => c.fromId === fromId && c.toId === toId && c.product === product,
  );
  if (existing) return existing;

  const connection: CompanyConnection = {
    id: `${fromId}__${toId}__${Date.now().toString(36)}`,
    fromId,
    toId,
    product,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: new Date().toISOString(),
  };
  writeAll([connection, ...readAll()]);
  return connection;
}

export function deleteConnection(id: string) {
  writeAll(readAll().filter((c) => c.id !== id));
}

export function subscribeConnections(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-connections-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-connections-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

/** Graph nodes + edges for the all-companies view. */
export function connectionGraph(companyIds: string[]) {
  const idSet = new Set(companyIds);
  const edges = readAll().filter(
    (c) => idSet.has(c.fromId) && idSet.has(c.toId),
  );
  return { nodes: companyIds, edges };
}

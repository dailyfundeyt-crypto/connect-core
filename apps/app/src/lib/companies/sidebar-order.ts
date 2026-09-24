/**
 * Local sidebar order for company agents (outside folders).
 * Projects keep their own agentIds order; project list order lives in projects storage.
 */

const KEY = "connect.sidebar.agentOrder.v1";

type OrderMap = Record<string, string[]>;

function readMap(): OrderMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as OrderMap;
  } catch {
    return {};
  }
}

function writeMap(map: OrderMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event("connect-sidebar-order-changed"));
  void import("./workspace-sync").then((m) => m.scheduleConnectWorkspacePush());
}

export function getAgentSidebarOrder(companyId: string): string[] {
  return readMap()[companyId] ?? [];
}

export function setAgentSidebarOrder(companyId: string, ids: string[]) {
  const map = readMap();
  map[companyId] = ids;
  writeMap(map);
}

/** Apply a saved order to a list of ids; unknown ids keep relative append order. */
export function applyIdOrder(ids: string[], preferred: string[]): string[] {
  if (preferred.length === 0) return ids;
  const set = new Set(ids);
  const ordered = preferred.filter((id) => set.has(id));
  const rest = ids.filter((id) => !ordered.includes(id));
  return [...ordered, ...rest];
}

export function moveIdBefore(
  ids: string[],
  draggedId: string,
  targetId: string,
): string[] {
  if (draggedId === targetId) return ids;
  const without = ids.filter((id) => id !== draggedId);
  const at = without.indexOf(targetId);
  if (at < 0) return ids;
  without.splice(at, 0, draggedId);
  return without;
}

export const DND_PROJECT = "application/x-connect-project";
export const DND_AGENT = "application/x-connect-agent";

export function subscribeSidebarOrder(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-sidebar-order-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-sidebar-order-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

/**
 * Unternehmen — mark a region on the company site, pick an agent, send a task.
 * Region is stored as % of the iframe box (cross-origin safe; no DOM peek).
 */

export type SiteMarkRect = {
  /** 0–100, left of iframe */
  x: number;
  /** 0–100, top of iframe */
  y: number;
  /** 0–100 */
  w: number;
  /** 0–100 */
  h: number;
};

export type SiteMarkState = {
  companyId: string;
  agentId: string | null;
  marking: boolean;
  marks: SiteMarkRect[];
  updatedAt: string;
};

const KEY = "connect.site.mark";
const EVENT = "connect-site-mark-changed";

type Store = Record<string, SiteMarkState>;

function empty(companyId: string): SiteMarkState {
  return {
    companyId,
    agentId: null,
    marking: false,
    marks: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function readAll(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
}

export function getSiteMark(companyId: string): SiteMarkState {
  return readAll()[companyId] ?? empty(companyId);
}

function patch(
  companyId: string,
  next: Partial<Omit<SiteMarkState, "companyId">>,
): SiteMarkState {
  const prev = getSiteMark(companyId);
  const merged: SiteMarkState = {
    ...prev,
    ...next,
    companyId,
    updatedAt: new Date().toISOString(),
  };
  const all = readAll();
  all[companyId] = merged;
  writeAll(all);
  return merged;
}

export function setSiteMarkAgent(
  companyId: string,
  agentId: string | null,
): SiteMarkState {
  return patch(companyId, { agentId });
}

export function setSiteMarking(
  companyId: string,
  marking: boolean,
): SiteMarkState {
  return patch(companyId, { marking });
}

export function setSiteMarks(
  companyId: string,
  marks: SiteMarkRect[],
): SiteMarkState {
  return patch(companyId, { marks });
}

export function addSiteMark(
  companyId: string,
  mark: SiteMarkRect,
): SiteMarkState {
  const prev = getSiteMark(companyId);
  // One primary mark for now — replace.
  return patch(companyId, {
    marks: [normalizeMark(mark)],
    marking: false,
  });
}

export function clearSiteMarks(companyId: string): SiteMarkState {
  return patch(companyId, { marks: [] });
}

export function subscribeSiteMark(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function normalizeMark(m: SiteMarkRect): SiteMarkRect {
  let { x, y, w, h } = m;
  if (w < 0) {
    x += w;
    w = Math.abs(w);
  }
  if (h < 0) {
    y += h;
    h = Math.abs(h);
  }
  x = Math.max(0, Math.min(100, x));
  y = Math.max(0, Math.min(100, y));
  w = Math.max(0.5, Math.min(100 - x, w));
  h = Math.max(0.5, Math.min(100 - y, h));
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    w: Math.round(w * 10) / 10,
    h: Math.round(h * 10) / 10,
  };
}

/** Prompt the agent can run with Browser Use / MCP. */
export function buildSiteTaskPrompt(input: {
  siteUrl: string;
  companyName: string;
  marks: SiteMarkRect[];
  task: string;
  /** Other agents running in parallel (names). */
  peers?: string[];
  /** This agent is one of several mice on duplicated pages. */
  multiAgent?: boolean;
}): string {
  const task = input.task.trim();
  const marks =
    input.marks.length === 0
      ? "Kein Bereich markiert — arbeite auf der ganzen Seite."
      : input.marks
          .map(
            (m, i) =>
              `${i + 1}. x=${m.x}% y=${m.y}% Breite=${m.w}% Höhe=${m.h}% (relativ zum Viewport der Firmenseite)`,
          )
          .join("\n");

  const multi = input.multiAgent
    ? [
        "",
        "Parallel-Modus (mehrere Mäuse):",
        "Du und andere Agenten arbeitet gleichzeitig. Jeder öffnet eine EIGENE Kopie der Firmenseite in seinem Chrome-Profil bzw. Browser-Use / MCP — nicht denselben Tab teilen.",
        input.peers && input.peers.length > 0
          ? `Andere Agenten parallel: ${input.peers.join(", ")}. Sie helfen dir; konzentriere dich auf DEINEN Auftrag unten.`
          : "Andere Agenten können parallel helfen — fokussiere nur deinen Auftrag.",
      ]
    : [];

  return [
    `Unternehmen-Auftrag für „${input.companyName}".`,
    "",
    `Firmenseite: ${input.siteUrl}`,
    "",
    "Markierter Bereich:",
    marks,
    ...multi,
    "",
    "Auftrag vom Nutzer:",
    task,
    "",
    "Nutze Browser Use (lokaler oder Cloud-Browser) bzw. verfügbare MCP-Tools.",
    "Öffne die URL, fokussiere den markierten Bereich und erledige den Auftrag dort.",
  ].join("\n");
}

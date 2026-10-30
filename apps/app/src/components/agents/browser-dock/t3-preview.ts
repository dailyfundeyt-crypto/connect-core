/**
 * A32 — Adapter zur T3-Browser-Vorschau.
 *
 * EIGENTÜMER: A32.
 *
 * Bestandsaufnahme (29.10.2026, T3-Code nur gelesen):
 *  - T3s Vorschau liegt in `apps/server/src/preview/` (PreviewManager,
 *    ServerBrowser, ServerBrowserStream, PreviewBrowser, PortScanner,
 *    SessionControl, DesktopBrowserChannel).
 *  - Metadaten laufen über WS-RPC (`preview.open|navigate|resize|adjust|
 *    refresh|close|list`, `subscribePreviewEvents`, siehe
 *    `packages/contracts/src/rpc.ts`), Frames über `GET /api/preview-stream/*`
 *    (binär, Viewer-Session mit Steuerungs-Owner).
 *  - Die Connect-Brücke (`apps/server/src/t3-bridge/**`) hat dafür HEUTE keine
 *    Routen/Typen. Deshalb ist die Brücke hier eine optionale Prop:
 *    ohne sie nutzt das Dock Connects Agent-Chrome-Steuerung.
 *
 * Diese Datei enthält keine Netzwerkaufrufe und keine Secrets. Sie liefert nur
 * Typwächter und die RPC-Namen, damit ein späterer Brücken-Bauer (A01/A03/A11)
 * nichts erraten muss.
 */

import type { T3PreviewBridge, T3PreviewTab } from "./types";

/** RPC-Methoden, die T3 für die Vorschau anbietet (nur Referenz). */
export const T3_PREVIEW_RPC_METHODS = [
  "preview.open",
  "preview.navigate",
  "preview.resize",
  "preview.adjust",
  "preview.refresh",
  "preview.close",
  "preview.list",
  "preview.clearProfile",
  "preview.reportProfiles",
  "preview.reportStatus",
  "subscribePreviewEvents",
] as const;

/** T3s Frame-Stream (binär, nicht als `<img>` nutzbar). */
export const T3_PREVIEW_STREAM_ROUTE_PREFIX = "/api/preview-stream";

/**
 * Wunsch-Routen für die Connect-Brücke. Noch nicht implementiert; das Dock
 * ruft sie nicht selbst auf, sondern bekommt eine fertige `T3PreviewBridge`.
 */
export const T3_PREVIEW_BRIDGE_ROUTE_HINTS = {
  list: "/api/t3/preview/sessions",
  open: "/api/t3/preview/open",
  navigate: "/api/t3/preview/navigate",
  frame: "/api/t3/preview/frame",
} as const;

export function isT3PreviewTab(value: unknown): value is T3PreviewTab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Record<string, unknown>;
  return (
    typeof tab.threadId === "string" &&
    typeof tab.tabId === "string" &&
    typeof tab.url === "string" &&
    typeof tab.title === "string" &&
    typeof tab.canGoBack === "boolean" &&
    typeof tab.canGoForward === "boolean" &&
    typeof tab.updatedAt === "string" &&
    (tab.frameUrl === null || typeof tab.frameUrl === "string")
  );
}

/** Eine Brücke ist nur brauchbar, wenn sie Tabs auflisten kann. */
export function isUsableT3PreviewBridge(
  bridge: T3PreviewBridge | null | undefined,
): bridge is T3PreviewBridge {
  return Boolean(bridge && typeof bridge.listTabs === "function");
}

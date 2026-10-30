/**
 * A32 — Öffentliche API der Browser-Andockleiste.
 *
 * EIGENTÜMER: A32.
 *
 * Einbau durch A39/A40 (außerhalb dieser Lane):
 * ```tsx
 * import { BrowserDock } from "@/components/agents/browser-dock";
 *
 * <div className="flex h-full min-h-0">
 *   <main className="min-w-0 flex-1">{chat}</main>
 *   <BrowserDock agentId={agent.id} agentName={agent.name} />
 * </div>
 * ```
 * Flag aus (`connect.t3.bridge` bzw. `forceFlag={false}`) = `null`, altes
 * Verhalten bleibt unverändert.
 */

export { BrowserDock, type BrowserDockProps } from "./browser-dock";
export { BrowserDockView } from "./browser-dock-view";
export {
  BROWSER_DOCK_STORAGE_KEY,
  BROWSER_DOCK_WIDTH_DEFAULT,
  BROWSER_DOCK_WIDTH_MAX,
  BROWSER_DOCK_WIDTH_MIN,
  clampBrowserDockWidth,
  isBrowserDockMode,
  parseBrowserDockSettings,
  readBrowserDockSettings,
  readStoredBrowserDockSettings,
  writeBrowserDockSettings,
} from "./storage";
export { useBrowserDock, useNarrowViewport } from "./use-browser-dock";
export {
  T3_PREVIEW_BRIDGE_ROUTE_HINTS,
  T3_PREVIEW_RPC_METHODS,
  T3_PREVIEW_STREAM_ROUTE_PREFIX,
  isT3PreviewTab,
  isUsableT3PreviewBridge,
} from "./t3-preview";
export {
  T3_PREVIEW_STREAM_PATH,
  openT3PreviewStream,
  type T3PreviewCallbacks,
  type T3PreviewControlFrame,
  type T3PreviewHandle,
  type T3PreviewJsonFrame,
  type T3PreviewViewportFrame,
} from "./t3-preview-client";
export type {
  BrowserDockMode,
  BrowserDockRenderContext,
  BrowserDockSettings,
  T3PreviewBridge,
  T3PreviewTab,
} from "./types";

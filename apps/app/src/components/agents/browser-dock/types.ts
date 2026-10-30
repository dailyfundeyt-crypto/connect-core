/**
 * A32 — Browser seitlich andocken (Ideen I8/I10).
 *
 * EIGENTÜMER: A32. Lane: `apps/app/src/components/agents/browser-dock/**`.
 *
 * Keine Server- oder Vertragsänderung: die Typen hier sind reine UI-/Adapter-Typen.
 * Die T3-Vorschau-Typen spiegeln nur den Teil von T3s `PreviewSessionSnapshot`
 * (`apps/server/src/preview/Manager.ts`), den die Andockleiste braucht.
 */

/** Schwebend über dem Chat (bisheriges Verhalten) oder rechts angedockt. */
export type BrowserDockMode = "floating" | "docked";

export type BrowserDockSettings = {
  mode: BrowserDockMode;
  /** Breite der angedockten Leiste in CSS-Pixeln. */
  width: number;
};

/**
 * Ein Tab der T3-Server-Vorschau.
 *
 * T3 liefert Metadaten über WS-RPC (`preview.list`) und den Frame-Stream über
 * `GET /api/preview-stream/*`. Beides ist heute NICHT über die Connect-Brücke
 * exponiert; die Leiste akzeptiert deshalb eine optionale Brücke (Prop) und
 * fällt sonst auf Connects eigene Agent-Chrome-Steuerung zurück.
 */
export type T3PreviewTab = {
  threadId: string;
  tabId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  /**
   * Bild-URL der T3-Vorschau (JPEG-/MJPEG-Endpunkt, als `<img>` ladbar).
   * `null`, wenn nur Metadaten vorliegen — T3s binäre WS-Frames brauchen
   * einen Decoder, den die Brücke noch nicht liefert.
   */
  frameUrl: string | null;
  updatedAt: string;
};

/**
 * Minimale Brücke zur T3-Browser-Vorschau.
 *
 * Ein späterer Integrator (A03/A11) kann sie über die T3-Brücke füllen, ohne
 * dass die Andockleiste geändert werden muss. Fehlt sie, bleibt Connects
 * bestehende Browser-Steuerung allein zuständig.
 */
export type T3PreviewBridge = {
  listTabs: (agentId: string) => Promise<T3PreviewTab[]>;
  navigate?: (agentId: string, tabId: string, url: string) => Promise<void>;
  refresh?: (agentId: string, tabId: string) => Promise<void>;
};

/** Kontext für Tests und Einbettung, die den Inhalt ersetzen wollen. */
export type BrowserDockRenderContext = {
  agentId: string;
  agentName: string;
  mode: BrowserDockMode;
  setMode: (mode: BrowserDockMode) => void;
  t3Preview?: T3PreviewBridge;
};

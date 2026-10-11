/**
 * Erweiterungen (Extensions) — Modul-Marken wie Spark, Flux, Hyper, Analysis.
 *
 * Wichtig: NICHT zu verwechseln mit `/admin/plugins/*` (das ist das
 * Vendor-Connector-System: Notion, Google Drive, MCP-Server). Extensions
 * sind grobkörnige Feature-Schalter pro Company.
 */

export type ExtensionKey = "flux" | "hyper" | "spark" | "analysis";

/**
 * Eine Erweiterung ist ein Modul, das global AN oder AUS ist. Wird sie
 * ausgeschaltet, verschwindet sie aus Sidebar, Settings-Tabs und Routen.
 * Eine Erweiterung kann eigene Routen, Sidebar-Items und Settings-Sektionen
 * registrieren — der Gate-Hook `useExtensionEnabled(key)` entscheidet, was
 * gerendert wird.
 */
export type ExtensionManifest = {
  /** Stabile ID, in Storage und Telemetry verwendet. Niemals umbenennen. */
  key: ExtensionKey;
  /** Anzeigename in UI (deutsch, kurz). */
  label: string;
  /** Ein-Satz-Beschreibung in den Settings. */
  description: string;
  /**
   * Tabler-Icon-Name (siehe `@tabler/icons-react`). Wir speichern nur den
   * Namen, damit der Bundle-Splitting-Pfad der Icons stabil bleibt — der
   * Mappings-Resolver steht in `context.tsx`.
   */
  iconName: TablerIconName;
  /**
   * Standardzustand beim ersten App-Start. Wir setzen alles auf true —
   * Nutzer sollen Funktionen entdecken, nicht suchen müssen.
   */
  defaultEnabled: boolean;
  /**
   * Versions-Tag für Migrationen. Wenn der Storage-Stand ein älteres
   * Schema hat, ergänzen wir fehlende Keys mit `defaultEnabled`.
   */
  schemaVersion: number;
};

/**
 * Tabler-Icon-Namen, die wir tatsächlich nutzen. Komponenten-Mapping
 * passiert zentral in `context.tsx` über eine Lookup-Tabelle. Wenn du
 * ein neues Icon brauchst: hier ergänzen + Mapping in `context.tsx`.
 */
export type TablerIconName =
  | "IconBolt"
  | "IconRocket"
  | "IconBrain"
  | "IconChartBar";

/** Eine Aufzeichnung dessen, was der Nutzer aktiv hat. */
export type ExtensionsState = Record<ExtensionKey, boolean>;

/**
 * Das Fenster für die Render-Tests — einmal für den ganzen Prozess.
 *
 * Bun führt mehrere Testdateien im selben Prozess aus. Registriert jede Datei ihr eigenes
 * Fenster, zerstört das Abmelden der einen Datei das Fenster der anderen — und die React-
 * Arbeit, die danach noch aufwacht, läuft ins Leere.
 *
 * Darum: ein Fenster für alle, und es wird nicht abgemeldet. Der Prozess endet von allein.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Stellt sicher, dass ein `document` vorhanden ist.
 *
 * WICHTIG: Der Zustand wird JEDES MAL am echten Objekt geprüft, nicht an einem
 * Modul-Flag. Grund: Andere Testdateien melden ihr happy-dom per
 * `GlobalRegistrator.unregister()` wieder ab. Danach ist `document` weg, das
 * Modul-Flag behauptet aber weiterhin „registriert" — und jede spätere Datei
 * rendert ins Leere.
 *
 * `GlobalRegistrator.isRegistered` allein reicht auch nicht: es kann `true` sein,
 * während `globalThis.document` trotzdem fehlt (Teardown-Zwischenzustand).
 * Deshalb werden beide Bedingungen geprüft.
 */
export function ensureDom(): void {
  if (typeof globalThis.document !== "undefined" && typeof globalThis.window !== "undefined") {
    return;
  }
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register({ url: "http://localhost/" });
    return;
  }
  /*
   * Registriert, aber kein Fenster: eine andere Testdatei hat unregister()
   * aufgerufen. Neu binden — testing-library, die schon an das alte
   * `document` gebunden ist, bleibt tot; Dateien, die `@testing-library/react`
   * erst NACH diesem Aufruf dynamisch laden, funktionieren.
   */
  try {
    GlobalRegistrator.unregister();
  } catch {
    /* schon weg */
  }
  GlobalRegistrator.register({ url: "http://localhost/" });
}

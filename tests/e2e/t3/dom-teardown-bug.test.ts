/**
 * A40 — Befund: DOM-Teardown durch Alt-Testdateien (Lane: Bestand, nicht T3).
 *
 * ## Das Problem
 *
 * `apps/app/src/test/dom.ts` (Lane A21) registriert das DOM **einmal** für den
 * ganzen Prozess:
 *
 *     let registered = false;
 *     export function ensureDom(): void {
 *       if (registered) return;          // ← ab hier wird nie wieder registriert
 *       if (typeof globalThis.window === "undefined") {
 *         GlobalRegistrator.register({ url: "http://localhost/" });
 *       }
 *       registered = true;
 *     }
 *
 * Rund 50 **Alt-Testdateien** rufen dagegen in ihrem `afterAll` ein
 * `GlobalRegistrator.unregister()` auf — z. B.
 * `apps/app/tests/agent-roster-error.test.tsx`.
 *
 * Bun führt alle Testdateien in **einem** Prozess aus. Sobald eine dieser
 * Alt-Dateien fertig ist, ist das DOM weg. `ensureDom()` merkt sich aber nur
 * „ich habe einmal registriert" — der Zähler `registered` bleibt `true`, also
 * registriert `ensureDom()` **nie wieder** etwas.
 *
 * ## Die Wirkung
 *
 * Jede T3-Testdatei, die **nach** so einer Alt-Datei läuft, findet kein
 * `document` mehr und scheitert mit:
 *
 *     TypeError: undefined is not an object (evaluating 'baseElement.appendChild')
 *
 * Betroffen (schlagen nur im Gesamtlauf fehl, isoliert sind sie grün):
 * `lib/t3/t3.test.ts`, `components/channels/t3/t3-chat.test.tsx`,
 * `components/agents/t3-cli-selector/t3-cli-selector.test.tsx`,
 * `components/companies/token-usage/token-usage.test.tsx`,
 * `components/fleet/fleet.test.tsx`, `components/app-sidebar/agent-grid/agent-grid.test.tsx`,
 * `components/agents/browser-dock/browser-dock.test.tsx`,
 * `components/onboarding/machines/machine-onboarding-step.test.tsx`,
 * `components/settings/machines/machines-settings.test.tsx`,
 * `components/settings/t3/t3-settings.test.tsx`.
 *
 * ## Warum das kein T3-Defekt ist
 *
 * `apps/app/src/test/dom.ts` gehört **A21**. Die Alt-Testdateien mit `unregister()`
 * sind Bestand und in keiner T3-Lane. A40 ändert nichts davon (Regel 1).
 *
 * Dieser Test **dokumentiert** den Zustand: er prüft, dass das DOM nach einem
 * `unregister()` nicht automatisch wieder da ist — also dass der Zustand, in
 * dem die T3-Tests im Gesamtlauf landen, wirklich eintritt.
 *
 * Der Import von `@happy-dom/global-registrator` läuft über den App-Pfad,
 * weil das Paket in `apps/app/node_modules` liegt und nicht im Wurzel-
 * `node_modules`.
 */

import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "../../../apps/app/node_modules/@happy-dom/global-registrator";

describe("A40: Befund — DOM-Teardown durch Alt-Testdateien", () => {
  test("nach `unregister()` ist das DOM weg — der Zustand, in dem T3-Tests landen", () => {
    const hadDom = typeof globalThis.window !== "undefined";
    GlobalRegistrator.register({ url: "http://localhost/" });
    expect(typeof globalThis.window).not.toBe("undefined");

    GlobalRegistrator.unregister();

    // Genau das ist der Auslöser für „baseElement.appendChild" im Gesamtlauf.
    expect(typeof globalThis.window).toBe("undefined");

    // Für die weiteren Tests in diesem Prozess das DOM wieder herstellen.
    if (!hadDom) {
      GlobalRegistrator.register({ url: "http://localhost/" });
    }
  });
});

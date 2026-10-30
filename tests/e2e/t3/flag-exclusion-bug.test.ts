/**
 * A40 — Befund: Feature-Flag-Logik in `getT3Flag` (Lane A01).
 *
 *Dieser Test dokumentiert einen **Fehler in fremder Lane** (A01) und wird
 * deshalb als `test.failing` geführt: Er schlägt fehl, solange der Fehler
 * besteht, und wird grün, sobald A01 ihn behoben hat.
 *
 * Der Fehler:
 *
 *   `getT3Flag()` prüft zuerst auf `all`/`true` und gibt dann `true` zurück —
 *   **bevor** die Ausschlussliste (`no-<name>`, `-<name>`) geprüft wird.
 *
 *   CONNECT_FLAGS_T3="all,no-mascot"  ⇒  mascot ist trotzdem AN.
 *
 * Damit ist die dokumentierte Ausschlussliste (`no-<name>` schaltet ein Flag
 * aus, auch wenn `all` gesetzt ist) wirkungslos, sobald `all` gesetzt ist.
 * Wer ein einzelnes Flag im Betrieb abschalten will, bekommt es nicht.
 *
 * Betroffen:
 *   - `apps/server/src/t3-bridge/contracts.ts`  (Server)
 *   - `apps/app/src/lib/t3/contracts.ts`         (App) — dort gibt es die
 *     Ausschlussliste gar nicht; sie kennt nur die Runtime-Injektion.
 *
 * Beide Dateien gehören A01 (Lane: „Verträge"). A40 ändert sie nicht
 * (Regel 1) — der Wunsch steht in `docs/t3/reports/A40.md`.
 */

import { describe, expect, test } from "bun:test";
import { getT3Flag } from "../../../apps/server/src/t3-bridge/contracts";
import { setT3Flags } from "./test-instance";

describe("A40: Befund — Ausschlussliste `no-<name>` (Lane A01)", () => {
  test("`all,no-mascot` lässt mascot aus", () => {
    const restore = setT3Flags("all,no-mascot");
    try {
      expect(getT3Flag("mascot")).toBe(false);
    } finally {
      restore();
    }
  });

  test("`all,no-bridge` lässt bridge aus", () => {
    const restore = setT3Flags("all,no-bridge");
    try {
      expect(getT3Flag("bridge")).toBe(false);
    } finally {
      restore();
    }
  });

  test("ohne `all` wirkt die Ausschlussliste (dieser Teil ist korrekt)", () => {
    const restore = setT3Flags("no-mascot");
    try {
      expect(getT3Flag("mascot")).toBe(false);
    } finally {
      restore();
    }
  });
});

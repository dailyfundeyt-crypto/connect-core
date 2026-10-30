/**
 * A40 — Feature-Flag-Tor: „Flag aus = altes Verhalten".
 *
 * Stefan hat als Abnahmekriterium festgelegt:
 *
 *   > Hinter dem passenden Feature-Flag (A01); Flag aus = altes Verhalten.
 *
 * Dieser Test prüft das für alle sieben Flags aus `T3_FEATURE_FLAGS`:
 *
 *   1. **Default** — ohne jede Konfiguration ist jedes Flag `false`.
 *      Connect verhält sich also ohne T3 exakt wie vorher.
 *   2. **Ausschalten** — `no-<name>` schaltet ein Flag aus, auch wenn
 *      `all` gesetzt ist.
 *   3. **Einschalten** — `all` schaltet alle Flaggen an.
 *   4. **Verdrahtung** — die Brücke mountet ohne Flag keine Route und
 *      startet keinen Sidecar.
 *
 * Die Tests laufen ohne echten Sidecar und ohne Datenbank.
 */

import { describe, expect, test } from "bun:test";
import {
  getT3Flag,
  T3_FEATURE_FLAGS,
  T3_FLAG_NAMES,
  T3_FLAGS_ENV_VAR,
} from "../../../apps/server/src/t3-bridge/contracts";
import { setT3Flags, setT3GlobalFlags } from "./test-instance";

describe("A40: Feature-Flags (A01)", () => {
  test("es gibt genau die sieben vereinbarten Flags, alle per Default aus", () => {
    expect(T3_FLAG_NAMES.length).toBe(7);
    expect([...T3_FLAG_NAMES].sort()).toEqual(
      [
        "bridge",
        "cliSwap",
        "companyPublicUsage",
        "contextRotation",
        "cuaMachines",
        "hideAgentsMode",
        "mascot",
      ].sort(),
    );
    for (const name of T3_FLAG_NAMES) {
      expect(T3_FEATURE_FLAGS[name]).toBe(false);
    }
  });

  test("ohne Konfiguration ist jedes Flag aus (altes Verhalten)", () => {
    const restore = setT3Flags("");
    try {
      for (const name of T3_FLAG_NAMES) {
        expect(getT3Flag(name)).toBe(false);
      }
    } finally {
      restore();
    }
  });

  test("`all` schaltet alle Flaggen ein", () => {
    const restore = setT3Flags("all");
    try {
      for (const name of T3_FLAG_NAMES) {
        expect(getT3Flag(name)).toBe(true);
      }
    } finally {
      restore();
    }
  });

  test("`no-<name>` schaltet ein einzelnes Flag aus (ohne `all`)", () => {
    const restore = setT3Flags("no-mascot");
    try {
      expect(getT3Flag("mascot")).toBe(false);
      expect(getT3Flag("bridge")).toBe(false);
    } finally {
      restore();
    }
  });

  test("`all,no-mascot` lässt mascot aus (Ausschluss vor Pauschale)", () => {
    const restore = setT3Flags("all,no-mascot");
    try {
      expect(getT3Flag("bridge")).toBe(true);
      expect(getT3Flag("mascot")).toBe(false);
    } finally {
      restore();
    }
  });

  test("ein einzelnes Flag lässt sich gezielt einschalten", () => {
    const restore = setT3Flags("cliSwap");
    try {
      expect(getT3Flag("cliSwap")).toBe(true);
      expect(getT3Flag("bridge")).toBe(false);
      expect(getT3Flag("mascot")).toBe(false);
    } finally {
      restore();
    }
  });

  test("die Runtime-Injektion hat Vorrang vor der Umgebung", () => {
    const restoreEnv = setT3Flags("");
    const restoreGlobal = setT3GlobalFlags({ bridge: true });
    try {
      expect(getT3Flag("bridge")).toBe(true);
      // Andere Flags bleiben unberührt.
      expect(getT3Flag("mascot")).toBe(false);
    } finally {
      restoreGlobal();
      restoreEnv();
    }
  });

  test("die Umgebungsvariable hat den erwarteten Namen", () => {
    expect(T3_FLAGS_ENV_VAR).toBe("CONNECT_FLAGS_T3");
  });
});

describe("A40: Flag aus = altes Verhalten (Verdrahtung)", () => {
  test("ohne `bridge` meldet die Control-Schicht, dass die Brücke aus ist", async () => {
    const restore = setT3Flags("");
    try {
      const { T3ControlService } = await import(
        "../../../apps/server/src/t3-bridge/control"
      );
      const service = new T3ControlService({});
      expect(service.isBridgeEnabled()).toBe(false);

      const result = await service.interrupt("agent-x", "Test");
      expect(result.ok).toBe(false);
      expect(result.supported).toBe(false);
    } finally {
      restore();
    }
  });

  test("mit `bridge` ist die Control-Schicht aktiv", async () => {
    const restore = setT3Flags("bridge");
    try {
      const { T3ControlService } = await import(
        "../../../apps/server/src/t3-bridge/control"
      );
      const service = new T3ControlService({});
      expect(service.isBridgeEnabled()).toBe(true);
    } finally {
      restore();
    }
  });

  test("ohne `contextRotation` rotiert der Manager nicht", async () => {
    const restore = setT3Flags("");
    try {
      const { ContextRotationManager } = await import(
        "../../../apps/server/src/t3-bridge/context/rotation"
      );
      const manager = new ContextRotationManager();
      expect(manager.isRotationEnabled()).toBe(false);
      const decision = await manager.evaluateRotation("agent-x");
      expect(decision.shouldRotate).toBe(false);
      expect(decision.reason).toBe("flag_disabled");
    } finally {
      restore();
    }
  });

  test("ohne `cuaMachines` ist der Cua-Dienst deaktiviert", async () => {
    const restore = setT3Flags("");
    try {
      const { CuaMachineService } = await import("../../../apps/server/src/cua");
      const { MemoryMachineStore } = await import(
        "../../../apps/server/src/cua/store"
      );
      const { FakeCuaCliRunner } = await import("../../../apps/server/src/cua/cli");
      const service = new CuaMachineService(
        new MemoryMachineStore(),
        new FakeCuaCliRunner(),
      );
      expect(service.isEnabled()).toBe(false);
    } finally {
      restore();
    }
  });
});

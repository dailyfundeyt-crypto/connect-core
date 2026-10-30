/**
 * Umfassende Integrationstests für das Cua-Maschinen-Backend.
 *
 * Lane: A19
 * Akzeptanzkriterien:
 * 1. Kein `rm`/`delete`-Aufruf an `cua` im gesamten Modul (Test durchsucht Fake-Binary-Aufrufe).
 * 2. Schlafende Maschine verbraucht keine Screenshots.
 * 3. Screenshot-Drosselung (2–5 fps).
 * 4. Modus `shared` -> `per_agent` -> `shared` -> `per_agent`:
 *    - Eigene Maschinen pro Agent
 *    - Geteilte Maschine im Shared-Modus
 *    - Maschinen bleiben erhalten, werden nie gelöscht
 *    - Keine Duplikate bei wiederholtem Wechsel
 * 5. Ohne Consent-Eintrag keine Installation.
 * 6. Anbindung an Connect-Computer-Backend (`CuaComputerProvider`).
 */

import { describe, expect, test } from "bun:test";
import { CuaCliRunner, FakeCuaCliRunner } from "./cli";
import { CuaComputerProvider } from "./provider";
import { CuaMachineService } from "./service";
import { MemoryMachineStore } from "./store";

describe("A19: Cua-Maschinen-Backend Kernprüfungen", () => {
  test("AKZEPTANZKRITERIUM: Ohne Consent-Eintrag keine Installation", async () => {
    const store = new MemoryMachineStore();
    const fakeCli = new FakeCuaCliRunner();
    const service = new CuaMachineService(store, fakeCli);

    const userIdWithoutConsent = "user-no-consent";

    expect(
      service.installSmallDefault(userIdWithoutConsent),
    ).rejects.toThrow(/keine dokumentierte Zustimmung/);

    expect(
      service.createCustomMachine(userIdWithoutConsent, { name: "box" }),
    ).rejects.toThrow(/Keine Zustimmung/);

    expect(
      service.setMode(userIdWithoutConsent, "per_agent"),
    ).rejects.toThrow(/Keine Zustimmung/);

    // Keine Sandboxes erstellt
    expect(fakeCli.sandboxes.size).toBe(0);
    expect((await store.getMachines()).length).toBe(0);
  });

  test("AKZEPTANZKRITERIUM: Schlafende Maschine verbraucht keine Screenshots & Rate-Limiting", async () => {
    const store = new MemoryMachineStore();
    const fakeCli = new FakeCuaCliRunner();
    const service = new CuaMachineService(store, fakeCli);

    const userId = "stefan";
    await store.recordInstallConsent(userId, "test consent", "admin");

    // Standard-Sandbox anlegen (startet schlafend)
    const machine = await service.installSmallDefault(userId);
    expect(machine.status).toBe("sleeping");
    expect(fakeCli.screenshotCallCount).toBe(0);

    // 1. Screenshot-Aufruf auf schlafende Maschine
    const screen1 = await service.getScreen(machine.id, { tabOpen: true });
    expect(screen1.isSleeping).toBe(true);
    expect(screen1.isCached).toBe(true);
    // Cua CLI wurde NICHT aufgerufen!
    expect(fakeCli.screenshotCallCount).toBe(0);

    // 2. Maschine wecken
    await service.wake(machine.id);
    const awakeMachine = await store.getMachineById(machine.id);
    expect(awakeMachine?.status).toBe("running");

    // 3. Wenn Tab geschlossen ist (tabOpen: false) -> kein Screenshot-Aufruf
    const screenClosed = await service.getScreen(machine.id, { tabOpen: false });
    expect(screenClosed.isSleeping).toBe(false);
    expect(screenClosed.isCached).toBe(true);
    expect(fakeCli.screenshotCallCount).toBe(0);

    // 4. Frischer Screenshot bei geoeffnetem Tab
    const screenFresh = await service.getScreen(machine.id, { tabOpen: true });
    expect(screenFresh.isSleeping).toBe(false);
    expect(screenFresh.isCached).toBe(false);
    expect(fakeCli.screenshotCallCount).toBe(1);

    // 5. Weiterer Aufruf unmittelbar danach (<200ms) wird gedrosselt (Rate-Limiting)
    const screenThrottled = await service.getScreen(machine.id, { tabOpen: true });
    expect(screenThrottled.isCached).toBe(true);
    // Screenshot-Counter bleibt bei 1!
    expect(fakeCli.screenshotCallCount).toBe(1);
  });

  test("AKZEPTANZKRITERIUM: Modus shared -> per_agent -> shared -> per_agent (kein Löschen, keine Duplikate)", async () => {
    const store = new MemoryMachineStore();
    const fakeCli = new FakeCuaCliRunner();
    const service = new CuaMachineService(store, fakeCli);

    const userId = "dailyfunde.yt@gmail.com";
    await store.recordInstallConsent(userId, "owner consent via chat", "admin");

    store.userAgents = [
      { id: "agent-hermes", name: "Hermes Agent" },
      { id: "agent-t3", name: "T3 Agent" },
    ];

    // 1. Start im shared-Modus: Eine geteilte Maschine fuer alle
    await service.setMode(userId, "shared");

    const sharedMachines = await store.getMachines();
    expect(sharedMachines.length).toBe(1);
    const sharedDefault = sharedMachines[0];
    expect(sharedDefault.sharedDefault).toBe(true);

    const m1 = await service.getMachineForAgent("agent-hermes");
    const m2 = await service.getMachineForAgent("agent-t3");
    expect(m1?.id).toBe(sharedDefault.id);
    expect(m2?.id).toBe(sharedDefault.id);

    // 2. Wechsel auf per_agent: Jeder Agent bekommt genau eine eigene Maschine
    const perAgentResult = await service.setMode(userId, "per_agent");
    expect(perAgentResult.mode).toBe("per_agent");
    expect(perAgentResult.affectedAgents).toBe(2);

    const machinesPerAgent = await store.getMachines();
    // 1 shared Maschine + 2 eigene Maschinen = 3 Maschinen insgesamt
    expect(machinesPerAgent.length).toBe(3);

    const agent1Machine = await service.getMachineForAgent("agent-hermes");
    const agent2Machine = await service.getMachineForAgent("agent-t3");
    expect(agent1Machine).not.toBeNull();
    expect(agent2Machine).not.toBeNull();
    expect(agent1Machine?.id).not.toBe(agent2Machine?.id);
    expect(agent1Machine?.name).toBe("connect-cua-agent-agent-hermes");
    expect(agent2Machine?.name).toBe("connect-cua-agent-agent-t3");
    expect(agent1Machine?.status).toBe("sleeping"); // Neue Maschinen starten schlafend

    // 3. Wechsel zurueck auf shared: Alle Agenten zeigen auf geteilte Maschine, eigene Maschinen bleiben erhalten
    const backToShared = await service.setMode(userId, "shared");
    expect(backToShared.mode).toBe("shared");

    const m1Back = await service.getMachineForAgent("agent-hermes");
    const m2Back = await service.getMachineForAgent("agent-t3");
    expect(m1Back?.id).toBe(sharedDefault.id);
    expect(m2Back?.id).toBe(sharedDefault.id);

    // ANZAHL MASCHINEN UNVERAENDERT! Nichts geloescht!
    const machinesAfterReturn = await store.getMachines();
    expect(machinesAfterReturn.length).toBe(3);

    // 4. Erneuter Wechsel auf per_agent: NUTZT VORHANDENE MASCHINEN WIEDER, KEINE DUPLIKATE!
    await service.setMode(userId, "per_agent");
    const machinesSecondPerAgent = await store.getMachines();
    expect(machinesSecondPerAgent.length).toBe(3); // Weiterhin exakt 3 Maschinen!

    const m1Reused = await service.getMachineForAgent("agent-hermes");
    const m2Reused = await service.getMachineForAgent("agent-t3");
    expect(m1Reused?.id).toBe(agent1Machine?.id);
    expect(m2Reused?.id).toBe(agent2Machine?.id);
  });

  test("AKZEPTANZKRITERIUM: Kein rm/delete-Aufruf an cua im gesamten Modul", async () => {
    const store = new MemoryMachineStore();
    const fakeCli = new FakeCuaCliRunner();
    const service = new CuaMachineService(store, fakeCli);

    const userId = "audit-user";
    await store.recordInstallConsent(userId, "audit consent", "user");

    store.userAgents = [
      { id: "agent-1", name: "Agent 1" },
      { id: "agent-2", name: "Agent 2" },
    ];

    // Zahlreiche Operationen durchführen:
    // 1. Shared Setup
    await service.setMode(userId, "shared");
    const shared = await service.ensureSharedDefault(userId);

    // 2. Wake & Sleep
    await service.wake(shared.id);
    await service.getScreen(shared.id, { tabOpen: true });
    await service.sleep(shared.id);

    // 3. Modus-Wechsel hin und zurück
    await service.setMode(userId, "per_agent");
    await service.setMode(userId, "shared");
    await service.setMode(userId, "per_agent");

    // 4. ComputerProvider Aufrufe (locate, stop, reset)
    const provider = new CuaComputerProvider(service, store, userId);
    await provider.locate("agent-1");
    await provider.status("agent-1");
    await provider.stop("agent-1");
    await provider.reset("agent-1");
    await provider.list();

    // PRÜFUNG ALLER AUFGEZEICHNETEN CLI-AUFRUFE:
    expect(fakeCli.recordedCalls.length).toBeGreaterThan(0);

    for (const call of fakeCli.recordedCalls) {
      for (const arg of call.args) {
        const lower = arg.toLowerCase();
        expect(lower).not.toBe("rm");
        expect(lower).not.toBe("delete");
        expect(lower).not.toBe("--delete");
        expect(lower).not.toBe("destroy");
      }
    }

    // Zusätzlicher Schutztest für echten CuaCliRunner:
    const realCli = new CuaCliRunner();
    expect(() =>
      (realCli as any).assertNotDestructive(["sb", "rm", "some-box"]),
    ).toThrow(/Cua-Destruktion verboten/);

    expect(() =>
      (realCli as any).assertNotDestructive(["sb", "delete", "some-box"]),
    ).toThrow(/Cua-Destruktion verboten/);
  });

  test("CuaComputerProvider Anbindung an apps/server/src/computer/provider.ts", async () => {
    const store = new MemoryMachineStore();
    const fakeCli = new FakeCuaCliRunner();
    const service = new CuaMachineService(store, fakeCli);

    const userId = "bot-user";
    await store.recordInstallConsent(userId, "consent", "admin");

    const provider = new CuaComputerProvider(service, store, userId);

    expect(provider.name).toBe("cua");
    expect(provider.isolation).toBe("shared");

    // Bot lokalisiert Maschine -> Shared Default wird erzeugt und aufgeweckt
    const url = await provider.locate("bot-42");
    expect(url).toContain("http://127.0.0.1:3211/cua/connect-cua-shared-");

    const status = await provider.status("bot-42");
    expect(status.state).toBe("ready");

    // Stop legt die Maschine nur schlafen (suspend), kein rm!
    const stopResult = await provider.stop("bot-42");
    expect(stopResult.wasRunning).toBe(true);

    const statusAfterStop = await provider.status("bot-42");
    expect(statusAfterStop.state).toBe("unreachable");

    // List liefert ComputerLocation Einträge
    const list = await provider.list();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].botId).toBe("bot-42");
  });
});

/**
 * Tests für den Cua-Provisioning-Seed (Bestandsnutzer).
 *
 * Lane: A19
 * Akzeptanzkriterien:
 * - Bestandsnutzer dailyfunde.yt@gmail.com mit Admin-Consent: nach Start existiert genau eine Maschine,
 *   alle seine Agenten sind ihr zugewiesen.
 * - Zweiter Start legt keine weitere an (Idempotenz).
 * - Kein Onboarding-Dialog nötig.
 * - Ohne Consent-Eintrag keine Installation.
 */

import { describe, expect, test } from "bun:test";
import { FakeCuaCliRunner } from "../cli";
import { runCuaProvisioningSeed } from "./index";
import { CuaMachineService } from "../service";
import { MemoryMachineStore } from "../store";

describe("A19: Cua Bestandsnutzer-Provisionierung (Seed)", () => {
  test("Ohne Consent-Eintrag wird keine Maschine installiert", async () => {
    const store = new MemoryMachineStore();
    const fakeCli = new FakeCuaCliRunner();
    const service = new CuaMachineService(store, fakeCli);

    store.userAgents = [
      { id: "agent-1", name: "Alpha" },
      { id: "agent-2", name: "Beta" },
    ];

    // Kein Consent hinterlegt!
    const result = await runCuaProvisioningSeed(service, store);

    expect(result.processedUsers).toBe(0);
    expect(result.machinesCreated).toBe(0);
    expect((await store.getMachines()).length).toBe(0);
    expect(fakeCli.sandboxes.size).toBe(0);
  });

  test("dailyfunde.yt@gmail.com mit Admin-Consent: genau eine geteilte Maschine wird angelegt und allen Agenten zugewiesen", async () => {
    const store = new MemoryMachineStore();
    const fakeCli = new FakeCuaCliRunner();
    const service = new CuaMachineService(store, fakeCli);

    const stefanUserId = "user-stefan-kunc";

    // Admin-Consent wie in Migration 0571
    await store.recordInstallConsent(
      stefanUserId,
      "owner consent via chat 2026-10-29",
      "admin",
      "cua_install",
    );

    store.userAgents = [
      { id: "agent-code", name: "Coder" },
      { id: "agent-research", name: "Researcher" },
      { id: "agent-support", name: "Support" },
    ];

    // Manueller Mock für Consent-Erkennung im MemoryStore
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => [
            { userId: stefanUserId },
          ],
        }),
      }),
    } as any;

    // Erster Seed-Durchlauf
    const result1 = await runCuaProvisioningSeed(service, store, fakeDb);

    expect(result1.processedUsers).toBe(1);
    expect(result1.machinesCreated).toBe(1);
    expect(result1.agentsAssigned).toBe(3);

    // Genau EINE Maschine existiert
    const machines = await store.getMachines();
    expect(machines.length).toBe(1);
    const sharedMachine = machines[0];
    expect(sharedMachine.sharedDefault).toBe(true);
    expect(sharedMachine.name).toMatch(/^connect-cua-shared-/);
    expect(sharedMachine.kind).toBe("sandbox");

    // Alle Agenten sind dieser geteilten Maschine zugewiesen
    for (const agent of store.userAgents) {
      const assigned = await store.getMachineForAgent(agent.id);
      expect(assigned).not.toBeNull();
      expect(assigned?.id).toBe(sharedMachine.id);
    }

    // Modus steht auf shared
    const mode = await store.getMachineMode(stefanUserId);
    expect(mode).toBe("shared");

    // -------------------------------------------------------------------------
    // IDEMPOTENZ: Zweiter Start legt KEINE weitere Maschine an!
    // -------------------------------------------------------------------------
    const result2 = await runCuaProvisioningSeed(service, store, fakeDb);

    expect(result2.processedUsers).toBe(1);
    expect(result2.machinesCreated).toBe(0); // Keine neue Maschine!
    const machinesAfterSecondRun = await store.getMachines();
    expect(machinesAfterSecondRun.length).toBe(1);
    expect(machinesAfterSecondRun[0].id).toBe(sharedMachine.id);

    // Auch nachträglich hinzugefügte Agenten werden zugewiesen
    store.userAgents.push({ id: "agent-new", name: "New Agent" });
    await runCuaProvisioningSeed(service, store, fakeDb);
    const assignedNew = await store.getMachineForAgent("agent-new");
    expect(assignedNew?.id).toBe(sharedMachine.id);
  });
});

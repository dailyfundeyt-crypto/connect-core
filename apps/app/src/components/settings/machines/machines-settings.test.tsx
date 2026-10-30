/**
 * Tests für Cua-Maschinen-Einstellungen (Lane A26)
 *
 * AKZEPTANZKRITERIEN:
 * - Feature-Flag-Guard (Flag aus = altes Verhalten)
 * - Standard-Maschine „Lokal (alle Bots)“ immer oben
 * - „+ Maschine hinzufügen“ (Linux/Windows, klein/mittel)
 * - Maschinen-Modus: Standard ist „Eine Maschine für alle Agenten“
 * - Modus-Umschalten zeigt Vorschau, nennt NIE „löschen“
 * - Zuweisung Bot → Maschine
 * - Lifecycle: Wake / Sleep
 */

import { ensureDom } from "@/test/dom";
ensureDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { cleanup, fireEvent, render, screen, waitFor } = await import(
  "@testing-library/react"
);
import {
  MachinesSettingsPanel,
  MachineList,
  MachineModeSetting,
  AgentMachineAssignmentList,
  AddMachineDialog,
  resetMockMachinesStore,
} from "./index";
import type { Machine } from "./types";

beforeEach(() => {
  resetMockMachinesStore();
});

afterEach(() => {
  cleanup();
});

describe("A26: Cua-Maschinen-Einstellungen", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  test("Feature-Flag-Guard: Flag aus rendert altes Verhalten (Legacy-Panel)", () => {
    // Ohne forceCua und bei default flag (false)
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MachinesSettingsPanel forceCua={false} mock={true} />
      </QueryClientProvider>,
    );

    // Altes Ubuntu-Panel enthält Text "Ubuntu-Maschinen" oder "PC (Ubuntu-Docker)"
    expect(container.textContent).toContain("Ubuntu");
    expect(container.textContent).not.toContain("Maschinen-Modus");
  });

  test("Feature-Flag-Guard: Flag an rendert neue Cua-Maschinen-Einstellungen", async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MachinesSettingsPanel forceCua={true} mock={true} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(container.textContent).toContain("Maschinen & Sandboxes");
      expect(container.textContent).toContain("Maschinen-Modus");
      expect(container.textContent).toContain("Verfügbare Maschinen");
      expect(container.textContent).toContain("Bot-Zuweisung");
    });
  });

  test("Standard-Maschine „Lokal (alle Bots)“ steht immer an oberster Stelle", () => {
    const testMachines: Machine[] = [
      {
        id: "m-custom-2",
        name: "Zebra Worker",
        kind: "sandbox",
        owner: null,
        status: "sleeping",
        sharedDefault: false,
        cuaRef: "sb-2",
        lastActivityAt: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "m-custom-1",
        name: "Alpha Sandbox",
        kind: "sandbox",
        owner: null,
        status: "sleeping",
        sharedDefault: false,
        cuaRef: "sb-1",
        lastActivityAt: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "connect-cua-shared-default",
        name: "Lokal (alle Bots)",
        kind: "sandbox",
        owner: null,
        status: "sleeping",
        sharedDefault: true,
        cuaRef: "sb-default",
        lastActivityAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const { container } = render(
      <MachineList
        machines={testMachines}
        sharedDefaultId="connect-cua-shared-default"
        mock={true}
      />,
    );

    const items = container.querySelectorAll(".divide-y > div");
    expect(items.length).toBe(3);
    // Erste Zeile MUSS die Standard-Maschine sein!
    expect(items[0]?.textContent).toContain("Lokal (alle Bots)");
    expect(items[0]?.textContent).toContain("Standard (alle Bots)");
  });

  test("Maschinen-Modus: Standard ist „Eine Maschine für alle Agenten“", () => {
    const { container } = render(
      <MachineModeSetting currentMode="shared" agentCount={2} mock={true} />,
    );

    expect(container.textContent).toContain("Eine Maschine für alle Agenten");
    expect(container.textContent).toContain("Standard");
    expect(container.textContent).toContain("✓ Aktiv");
  });

  test("AKZEPTANZKRITERIUM: Umschalten zeigt Vorschau und nennt NIE „löschen“", async () => {
    let modeChangedTo: string | null = null;
    const { container, getByText } = render(
      <MachineModeSetting
        currentMode="shared"
        agentCount={3}
        onModeChanged={(m) => {
          modeChangedTo = m;
        }}
        mock={true}
      />,
    );

    // Klick auf „Eigene Maschine pro Agent“
    const perAgentBtn = getByText("Eigene Maschine pro Agent");
    fireEvent.click(perAgentBtn);

    // Dialog öffnet sich mit Vorschau
    await waitFor(() => {
      expect(document.body.textContent).toContain("Moduswechsel bestätigen");
      expect(document.body.textContent).toContain("Vorschau der Änderungen:");
      expect(document.body.textContent).toContain("Legt 3 neue Maschinen an");
    });

    const dialogText = document.body.textContent || "";

    // STRIKTE PRÜFUNG: Das Wort "löschen" (bzw. "gelöscht") darf NIEMALS vorkommen!
    expect(dialogText.toLowerCase()).not.toContain("löschen");
    expect(dialogText.toLowerCase()).not.toContain("gelöscht");
    expect(dialogText).toContain("keine Maschinen entfernt");

    // Bestätigen
    const confirmBtn = screen.getByText("Modus anwenden");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(modeChangedTo).toBe("per_agent");
    });
  });

  test("Zuweisung Bot → Maschine: Standard ist geteilte lokale", async () => {
    let assignedAgent: string | null = null;
    let assignedMachine: string | null = null;

    const bots = [
      { id: "agent-1", name: "Codex Bot", title: "Entwickler" },
      { id: "agent-2", name: "Claude Bot", title: "Autor" },
    ];

    const machines: Machine[] = [
      {
        id: "connect-cua-shared-default",
        name: "Lokal (alle Bots)",
        kind: "sandbox",
        owner: null,
        status: "sleeping",
        sharedDefault: true,
        cuaRef: "sb-default",
        lastActivityAt: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "sb-agent-2",
        name: "Claude Sandbox",
        kind: "sandbox",
        owner: "agent-2",
        status: "sleeping",
        sharedDefault: false,
        cuaRef: "sb-claude",
        lastActivityAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const { container, getAllByRole } = render(
      <AgentMachineAssignmentList
        bots={bots}
        machines={machines}
        sharedDefaultMachineId="connect-cua-shared-default"
        onAssignmentChanged={(a, m) => {
          assignedAgent = a;
          assignedMachine = m;
        }}
        mock={true}
      />,
    );

    expect(container.textContent).toContain("Codex Bot");
    expect(container.textContent).toContain("Claude Bot");

    // Dropdowns prüfen
    const selects = getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects.length).toBe(2);

    // Standardmäßig auf shared Default gesetzt
    expect(selects[0].value).toBe("connect-cua-shared-default");

    // Wechsel für Bot 2 auf Claude Sandbox
    fireEvent.change(selects[1], { target: { value: "sb-agent-2" } });

    await waitFor(() => {
      expect(assignedAgent).toBe("agent-2");
      expect(assignedMachine).toBe("sb-agent-2");
      expect(container.textContent).toContain("Gespeichert");
    });
  });

  test("Lifecycle: Klick auf Aufwecken / Schlafen legen steuert den Status", async () => {
    let statusChanges: { id: string; status: string }[] = [];

    const machines: Machine[] = [
      {
        id: "connect-cua-shared-default",
        name: "Lokal (alle Bots)",
        kind: "sandbox",
        owner: null,
        status: "sleeping",
        sharedDefault: true,
        cuaRef: "sb-default",
        lastActivityAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const { container, getByText } = render(
      <MachineList
        machines={machines}
        sharedDefaultId="connect-cua-shared-default"
        onStatusChanged={(id, status) => {
          statusChanges.push({ id, status });
        }}
        mock={true}
      />,
    );

    // Initial ist die Maschine schlafend
    expect(container.textContent).toContain("Schläft");
    const wakeBtn = getByText("Aufwecken");

    fireEvent.click(wakeBtn);

    await waitFor(() => {
      expect(statusChanges.length).toBe(1);
      expect(statusChanges[0].status).toBe("running");
    });
  });

  test("„+ Maschine hinzufügen“ validiert und erstellt neue Linux-Sandbox", async () => {
    let createdMachine: Machine | null = null;

    const { getByText, getByLabelText, getByRole } = render(
      <AddMachineDialog
        mock={true}
        onMachineCreated={(m) => {
          createdMachine = m;
        }}
      />,
    );

    // Button öffnen
    fireEvent.click(getByText("Maschine hinzufügen"));

    await waitFor(() => {
      expect(document.body.textContent).toContain("Neue Cua-Maschine anlegen");
    });

    // Validierung: Ohne Name deaktiviert
    const submitBtn = getByRole("button", { name: "Maschine anlegen" }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    // Name eingeben
    const nameInput = getByLabelText("Maschinen-Name") as HTMLInputElement;
    fireEvent.input(nameInput, { target: { value: "Go-Compiler-Sandbox" } });
    fireEvent.change(nameInput, { target: { value: "Go-Compiler-Sandbox" } });
    expect(submitBtn.disabled).toBe(false);

    // Erstellen
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createdMachine).not.toBeNull();
      expect(createdMachine?.name).toBe("Go-Compiler-Sandbox");
    });
  });
});

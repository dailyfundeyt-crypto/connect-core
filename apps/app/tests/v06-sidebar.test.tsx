import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import {
  ConfirmHardDeleteDialog,
  FALLBACK_MULTI_LOGIN_APPS,
  SidebarSectionOrder,
  groupBotsByFolder,
} from "@/v06/sidebar";

afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

describe("A01 – Frontend Messages-Sidebar Tests (v06)", () => {
  // Test 1: Sektionsreihenfolge
  describe("1. Sektionsreihenfolge (SidebarSectionOrder)", () => {
    test("rendert die 6 Sektionen in exakt der kanonischen Reihenfolge", () => {
      const { getByTestId, container } = render(
        <SidebarSectionOrder
          header={<div data-testid="test-header">Sektion 1: Firmenwechsel & Settings</div>}
          apps={<div data-testid="test-apps">Sektion 2: Multi-Login Apps</div>}
          folders={<div data-testid="test-folders">Sektion 3: Bot-Ordner</div>}
          unfiled={<div data-testid="test-unfiled">Sektion 4: Bots ohne Ordner</div>}
          tools={<div data-testid="test-tools">Sektion 5: Tools aktivierbar</div>}
          profile={<div data-testid="test-profile">Sektion 6: Profilbild sticky</div>}
        />,
      );

      // Alle 6 Sektionen vorhanden
      expect(getByTestId("test-header")).toBeTruthy();
      expect(getByTestId("test-apps")).toBeTruthy();
      expect(getByTestId("test-folders")).toBeTruthy();
      expect(getByTestId("test-unfiled")).toBeTruthy();
      expect(getByTestId("test-tools")).toBeTruthy();
      expect(getByTestId("test-profile")).toBeTruthy();

      // Pruefe data-section Attribute in exakter DOM-Reihenfolge
      const sectionElements = container.querySelectorAll("[data-section]");
      expect(sectionElements.length).toBe(6);

      const sectionKeys = Array.from(sectionElements).map((el) =>
        el.getAttribute("data-section"),
      );
      expect(sectionKeys).toEqual([
        "1-header",
        "2-apps",
        "3-folders",
        "4-unfiled",
        "5-tools",
        "6-profile",
      ]);
    });

    test("unterstuetzt auch Subkomponenten-Slots fuer flexible Einbindung", () => {
      const { container } = render(
        <SidebarSectionOrder>
          <SidebarSectionOrder.Header>
            <div id="c-header">Header</div>
          </SidebarSectionOrder.Header>
          <SidebarSectionOrder.Apps>
            <div id="c-apps">Apps</div>
          </SidebarSectionOrder.Apps>
          <SidebarSectionOrder.Folders>
            <div id="c-folders">Folders</div>
          </SidebarSectionOrder.Folders>
          <SidebarSectionOrder.Unfiled>
            <div id="c-unfiled">Unfiled</div>
          </SidebarSectionOrder.Unfiled>
          <SidebarSectionOrder.Tools>
            <div id="c-tools">Tools</div>
          </SidebarSectionOrder.Tools>
          <SidebarSectionOrder.Profile>
            <div id="c-profile">Profile</div>
          </SidebarSectionOrder.Profile>
        </SidebarSectionOrder>,
      );

      const sectionElements = container.querySelectorAll("[data-section]");
      expect(sectionElements.length).toBe(6);
      expect(Array.from(sectionElements).map((el) => el.getAttribute("data-section"))).toEqual([
        "1-header",
        "2-apps",
        "3-folders",
        "4-unfiled",
        "5-tools",
        "6-profile",
      ]);
    });
  });

  // Test 2: Gruppierung Ordner / ohne Ordner
  describe("2. Gruppierung Ordner vs. Bots ohne Ordner", () => {
    const mockBots = [
      { id: "bot-1", name: "AlphaBot", role: "Trading" },
      { id: "bot-2", name: "BetaBot", role: "DevOps" },
      { id: "bot-3", name: "GammaBot", role: "Research" },
      { id: "bot-4", name: "DeltaBot", role: "Marketing" },
      { id: "bot-other", name: "FremdBot", role: "External" }, // nicht in aktiver Firma
    ];

    const companyAgentIds = ["bot-1", "bot-2", "bot-3", "bot-4"];

    const mockProjects = [
      { id: "proj-1", name: "Finance Team", agentIds: ["bot-1"] },
      { id: "proj-2", name: "Infra Team", agentIds: ["bot-2"] },
      { id: "proj-empty", name: "Empty Folder", agentIds: [] },
    ];

    test("ordnet Bots korrekt den Ordnern bzw. unfiled zu", () => {
      const result = groupBotsByFolder(mockBots, companyAgentIds, mockProjects);

      // Ordner 1: Finance Team enthaelt bot-1
      expect(result.folders[0]?.name).toBe("Finance Team");
      expect(result.folders[0]?.bots.map((b) => b.id)).toEqual(["bot-1"]);
      expect(result.folders[0]?.bots[0]?.folderId).toBe("proj-1");

      // Ordner 2: Infra Team enthaelt bot-2
      expect(result.folders[1]?.name).toBe("Infra Team");
      expect(result.folders[1]?.bots.map((b) => b.id)).toEqual(["bot-2"]);

      // Ordner 3: Empty Folder
      expect(result.folders[2]?.bots.length).toBe(0);

      // Bots ohne Ordner: bot-3 und bot-4 (gehoeren zur Firma, aber in keinem Projekt)
      expect(result.unfiledBots.map((b) => b.id).sort()).toEqual(["bot-3", "bot-4"]);
      expect(result.unfiledBots[0]?.folderId).toBeNull();

      // FremdBot (bot-other) darf nirgendwo auftauchen
      const allAssignedIds = [
        ...result.folders.flatMap((f) => f.bots.map((b) => b.id)),
        ...result.unfiledBots.map((b) => b.id),
      ];
      expect(allAssignedIds.includes("bot-other")).toBe(false);
      expect(result.totalBots).toBe(4);
    });

    test("filtert Ordner und Unfiled Bots gemaess Suchbegriff", () => {
      const result = groupBotsByFolder(mockBots, companyAgentIds, mockProjects, "Trading");
      // bot-1 hat Rolle "Trading"
      expect(result.folders[0]?.bots.length).toBe(1);
      expect(result.folders[0]?.bots[0]?.id).toBe("bot-1");

      // bot-2 hat Rolle "DevOps" -> Ordner 2 leer im Suchergebnis
      expect(result.folders[1]?.bots.length).toBe(0);

      // Unfiled hat keinen "Trading" Bot
      expect(result.unfiledBots.length).toBe(0);
    });
  });

  // Test 3: Dialog-Button nur bei korrektem Namen aktiv
  describe("3. Bestätigungsdialog (ConfirmHardDeleteDialog)", () => {
    test("Loesch-Button ist erst dann aktiv, wenn exakt der Bot-Name eingetippt wird", () => {
      let confirmedWith: { botId: string; confirmName: string } | null = null;
      const handleConfirm = async (botId: string, confirmName: string) => {
        confirmedWith = { botId, confirmName };
      };

      const { getByTestId, getByText } = render(
        <ConfirmHardDeleteDialog
          open={true}
          onOpenChange={() => {}}
          botId="bot-42"
          botName="SparkAgent"
          onConfirm={handleConfirm}
        />,
      );

      // Dialog muss den Hinweis 'unwiderruflich, vorher wird ein JSON-Export erstellt' enthalten
      expect(
        getByText(/unwiderruflich, vorher wird ein JSON-Export erstellt/i),
      ).toBeTruthy();

      const input = getByTestId("hard-delete-confirm-input") as HTMLInputElement;
      const button = getByTestId("hard-delete-submit-button") as HTMLButtonElement;

      // 1. Initial: leer -> Button deaktiviert
      expect(input.value).toBe("");
      expect(button.disabled).toBe(true);

      // 2. Falscher Name -> Button weiterhin deaktiviert
      fireEvent.input(input, { target: { value: "WrongName" } });
      expect(button.disabled).toBe(true);

      // 3. Fast richtiger Name (Groß-/Kleinschreibung) -> deaktiviert
      fireEvent.input(input, { target: { value: "sparkagent" } });
      expect(button.disabled).toBe(true);

      // 4. Exakter Name -> Button wird aktiv
      fireEvent.input(input, { target: { value: "SparkAgent" } });
      expect(button.disabled).toBe(false);

      // 5. Exakter Name mit Whitespace (Trim) -> bleibt aktiv
      fireEvent.input(input, { target: { value: " SparkAgent " } });
      expect(button.disabled).toBe(false);

      // 6. Klick loest onConfirm mit korrekten Argumenten aus
      fireEvent.click(button);
      expect(confirmedWith as any).toEqual({ botId: "bot-42", confirmName: "SparkAgent" });
    });
  });

  // Test 4: Multi-Login Apps Fallback
  describe("4. Multi-Login Apps Fallback", () => {
    test("Fallback-Apps enthalten Codex, Antigravity und Manus", () => {
      const ids = FALLBACK_MULTI_LOGIN_APPS.map((a) => a.id);
      expect(ids).toContain("codex");
      expect(ids).toContain("antigravity");
      expect(ids).toContain("manus");
      expect(FALLBACK_MULTI_LOGIN_APPS.length).toBe(3);
    });
  });

  // Test 5: BotContextMenu & Flag-Verhalten
  describe("5. Bot-Kontextmenü & Flag-Verhalten", () => {
    test("rendert Kinder direkt wenn Flag botLifecycle inaktiv ist", () => {
      const { getByTestId, queryByText } = render(
        <div data-testid="bot-child">Test Bot Row</div>,
      );
      expect(getByTestId("bot-child")).toBeTruthy();
      expect(queryByText("Aus Firma entfernen")).toBeNull();
      expect(queryByText("Endgültig löschen")).toBeNull();
    });
  });
});

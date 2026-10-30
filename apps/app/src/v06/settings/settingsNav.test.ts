import { describe, expect, it } from "bun:test";
import {
  SETTINGS_GROUPS,
  SETTINGS_INVENTORY_ITEMS,
  getHiddenSections,
  getKeepSections,
  getMergedSections,
  getNavGroups,
  getVisibleSections,
  searchSections,
} from "./settingsNav";
import {
  getRegisteredSettingsSections,
  registerSettingsSection,
  subscribeRegisteredSections,
} from "./SettingsShellV2";
import type { SettingsSectionMeta } from "@/contracts/v06/settings-meta";

describe("Settings V2 Navigation (Audit & Inventory)", () => {
  it("hat maximal 6 Gruppen (genau 6 Gruppen laut Audit)", () => {
    expect(SETTINGS_GROUPS.length).toBeLessThanOrEqual(6);
    expect(SETTINGS_GROUPS.length).toBe(6);

    const groupIds = SETTINGS_GROUPS.map((g) => g.id);
    expect(groupIds).toEqual([
      "konto",
      "firma",
      "verbindungen",
      "agenten",
      "darstellung",
      "system",
    ]);

    // Keine doppelten Gruppen-IDs
    const uniqueGroupIds = new Set(groupIds);
    expect(uniqueGroupIds.size).toBe(SETTINGS_GROUPS.length);
  });

  it("enthält alle 40 Einträge aus settings-inventory.json", () => {
    expect(SETTINGS_INVENTORY_ITEMS.length).toBe(40);

    // Keine doppelten Sektions-IDs
    const ids = SETTINGS_INVENTORY_ITEMS.map((item) => item.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("jede 'keep'-Section ist erreichbar und in den Navigationsgruppen enthalten", () => {
    const keepSections = getKeepSections();
    expect(keepSections.length).toBeGreaterThan(0);

    const navGroups = getNavGroups();
    expect(navGroups.length).toBe(6);

    const allNavItems = navGroups.flatMap((g) => g.items);
    const allNavItemIds = new Set(allNavItems.map((item) => item.id));

    // Jede keep-Section MUSS in der Navigation auftauchen
    for (const keepItem of keepSections) {
      expect(allNavItemIds.has(keepItem.id)).toBe(true);
    }
  });

  it("'hide'-Sections sind NICHT in der Navigation enthalten", () => {
    const hiddenSections = getHiddenSections();
    expect(hiddenSections.length).toBeGreaterThan(0);

    const navGroups = getNavGroups();
    const allNavItems = navGroups.flatMap((g) => g.items);
    const allNavItemIds = new Set(allNavItems.map((item) => item.id));

    // Keine einzige versteckte Sektion darf in der Navigation auftauchen
    for (const hiddenItem of hiddenSections) {
      expect(allNavItemIds.has(hiddenItem.id)).toBe(false);
    }
  });

  it("zusammengelegte 'merge'-Sections referenzieren ein gültiges Ziel", () => {
    const mergedSections = getMergedSections();
    expect(mergedSections.length).toBeGreaterThan(0);

    const allIds = new Set(SETTINGS_INVENTORY_ITEMS.map((i) => i.id));

    for (const merged of mergedSections) {
      expect(merged.mergedInto).toBeDefined();
      expect(allIds.has(merged.mergedInto!)).toBe(true);
    }
  });

  it("doppelte Wege wurden entfernt ('handy-verbinden' existiert genau einmal)", () => {
    const phoneItems = SETTINGS_INVENTORY_ITEMS.filter(
      (item) => item.id === "handy-verbinden",
    );
    expect(phoneItems.length).toBe(1);
    expect(phoneItems[0].status).toBe("keep");
    expect(phoneItems[0].group).toBe("verbindungen");
  });

  it("Suchfunktion findet Abschnitte nach Label, ID, Beschreibung und Gruppe", () => {
    // Suche nach Label
    const kontoMatches = searchSections("Konto");
    expect(kontoMatches.some((m) => m.id === "konto")).toBe(true);

    // Suche nach ID
    const mcpMatches = searchSections("mcp");
    expect(mcpMatches.some((m) => m.id === "mcp")).toBe(true);

    // Suche nach Beschreibung
    const keyMatches = searchSections("OpenAI");
    expect(keyMatches.some((m) => m.id === "api-keys")).toBe(true);

    // Suche nach Gruppe
    const agentMatches = searchSections("agenten");
    expect(agentMatches.length).toBeGreaterThanOrEqual(4);

    // Leere Suche liefert alle sichtbaren Abschnitte
    const allVisible = searchSections("");
    expect(allVisible.length).toBe(getVisibleSections().length);

    // Keine Treffer für Unfug
    const emptyMatches = searchSections("xyznonexistent99999");
    expect(emptyMatches.length).toBe(0);
  });

  it("Slot-API registerSettingsSection registriert und deregistriert Komponenten fehlerfrei", () => {
    let notified = 0;
    const unsubscribeListener = subscribeRegisteredSections(() => {
      notified++;
    });

    const DummyComponent = () => null;
    const testMeta: SettingsSectionMeta = {
      id: "custom-test-slot",
      label: "Test Slot",
      group: "firma",
      status: "keep",
      usedBy: ["test"],
    };

    const unregister = registerSettingsSection(testMeta, DummyComponent);
    expect(notified).toBe(1);

    const currentSlots = getRegisteredSettingsSections();
    expect(currentSlots.some((s) => s.meta.id === "custom-test-slot")).toBe(
      true,
    );

    // Deregistrieren
    unregister();
    expect(notified).toBe(2);

    const slotsAfter = getRegisteredSettingsSections();
    expect(slotsAfter.some((s) => s.meta.id === "custom-test-slot")).toBe(
      false,
    );

    unsubscribeListener();
  });
});

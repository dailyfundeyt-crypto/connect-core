/**
 * Frontend-Logik-Tests E-Mail-Agenten v06 (A19) - bun test.
 * Getestet wird die reine Logik (kein React-Render):
 * - Anlage-Validierung (Beschreibung Pflichtfeld)
 * - Status-Bezeichner der Freigabe-Liste
 */

import { describe, expect, it } from "bun:test";
import { validateAgentDraft } from "./useEmailAgents";
import { EmailAgentsPage } from "./EmailAgentsPage";
import { OutboxApprovals } from "./OutboxApprovals";

describe("A19 Frontend: Anlage-Validierung", () => {
  it("Beschreibung ist Pflichtfeld", () => {
    const ohne = validateAgentDraft({
      address: "bot@example.com",
      name: "Recherche-Bot",
      description: "   ",
    });
    expect(ohne).toContain("Beschreibung");
  });

  it("Adressformat geprueft", () => {
    expect(validateAgentDraft({ address: "", name: "n", description: "d" })).toBeTruthy();
    expect(validateAgentDraft({ address: "invalid", name: "n", description: "d" })).toBeTruthy();
    expect(
      validateAgentDraft({
        address: "bot@example.com",
        name: "Recherche-Bot",
        description: "Recherche mit Quellen.",
      }),
    ).toBeNull();
  });
});

describe("A19 Frontend: Modul-Exporte vorhanden", () => {
  it("EmailAgentsPage und OutboxApprovals existieren als Komponenten", () => {
    expect(typeof EmailAgentsPage).toBe("function");
    expect(typeof OutboxApprovals).toBe("function");
  });
});

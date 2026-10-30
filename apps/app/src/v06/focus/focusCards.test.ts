import { describe, expect, test, beforeEach } from "bun:test";
import {
  FOCUS_ORDER_V2,
  FOCUS_GROKBOT_SETTING_KEY,
  GROKBOT_DEFAULT_TARGET,
  GROKBOT_SETTING_HINT,
  LEGACY_PERPLEXITY_TARGET,
  getFocusCardsV2,
  readGrokbotTarget,
} from "./focusCards";

describe("Focus Cards v06 (A02)", () => {
  beforeEach(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(FOCUS_GROKBOT_SETTING_KEY);
      }
    } catch {
      /* ignore */
    }
  });

  test("Kartenreihenfolge ist exakt ['plan', 'datenbank', 'aufgaben', 'emails']", () => {
    const cards = getFocusCardsV2();
    const ids = cards.map((c) => c.id);
    expect(ids).toEqual(["plan", "datenbank", "aufgaben", "emails"]);
    expect(FOCUS_ORDER_V2).toEqual(["plan", "datenbank", "aufgaben", "emails"]);
  });

  test("Genau 4 Karten; Agenten-Kontakte (agenten) ist nicht mehr enthalten", () => {
    const cards = getFocusCardsV2();
    expect(cards.length).toBe(4);
    const hasAgenten = cards.some((c) => c.id === ("agenten" as never));
    expect(hasAgenten).toBe(false);
  });

  test("Karte aufgaben oeffnet Grok-Bot statt Perplexity (Default aus DECISIONS.md)", () => {
    const cards = getFocusCardsV2();
    const aufgaben = cards.find((c) => c.id === "aufgaben");
    expect(aufgaben).toBeDefined();
    expect(aufgaben!.name).toBe("Aufgabenzuweisung");
    expect(aufgaben!.opens).toBe("grokbot");
    expect(aufgaben!.url).toBe(GROKBOT_DEFAULT_TARGET);
    expect(aufgaben!.url).not.toBe(LEGACY_PERPLEXITY_TARGET);
    // UI-Hinweis vorhanden, wenn kein benutzerdefiniertes Ziel gesetzt ist
    expect(aufgaben!.hint).toBe(GROKBOT_SETTING_HINT);
    expect(aufgaben!.isCustomTarget).toBe(false);
  });

  test("Karte aufgaben verwendet benutzerdefiniertes Ziel aus Einstellung focus.grokbotTarget", () => {
    const customTarget = "https://grok.x.ai/workspace/daily";
    const cards = getFocusCardsV2({ grokbotTarget: customTarget });
    const aufgaben = cards.find((c) => c.id === "aufgaben");
    expect(aufgaben).toBeDefined();
    expect(aufgaben!.url).toBe(customTarget);
    expect(aufgaben!.isCustomTarget).toBe(true);
    expect(aufgaben!.hint).toBeUndefined();
  });

  test("readGrokbotTarget liest Setting oder liefert DECISIONS.md Default", () => {
    const fallback = readGrokbotTarget();
    expect(fallback.target).toBe(GROKBOT_DEFAULT_TARGET);
    expect(fallback.isCustom).toBe(false);
    expect(fallback.hint).toBe(GROKBOT_SETTING_HINT);
  });

  test("Legacy-Perplexity-Ziel bleibt als Konstante erhalten (Niemals loeschen)", () => {
    expect(LEGACY_PERPLEXITY_TARGET).toContain("perplexity.ai");
  });

  test("Planung und Datenbank haben die korrekten Ziele", () => {
    const cards = getFocusCardsV2({ googleAccount: "test@example.com" });
    const plan = cards.find((c) => c.id === "plan");
    const db = cards.find((c) => c.id === "datenbank");
    const emails = cards.find((c) => c.id === "emails");

    expect(plan?.opens).toBe("docs");
    expect(plan?.url).toContain("docs.google.com");
    expect(plan?.url).toContain("authuser=test%40example.com");

    expect(db?.opens).toBe("database");
    expect(db?.url).toContain("drive.google.com");
    expect(db?.url).toContain("authuser=test%40example.com");

    expect(emails?.opens).toBe("email");
    expect(emails?.url).toContain("mail.google.com");
  });
});

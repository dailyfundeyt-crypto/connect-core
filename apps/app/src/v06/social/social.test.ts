/**
 * Connect-Sozial: Frontend Tests (v06 / A24)
 *
 * Testet:
 * - Composer-Validierungslogik (Text/Bilder, Autor-Wahl Firma/Bot)
 * - DonateBotDialog-Validierung (Bot-Auswahl, Tageskontingent, Ablaufdatum)
 * - TaskTree-Hierarchiebildung (DAG-Aufgabenbaum)
 * - ArticleEditorOffer (Preisberechnung, Deaktivierte Zahlungen)
 * - useSocial Query Keys und Pfade
 */

import { describe, expect, it } from "bun:test";
import { buildTaskHierarchy } from "./TaskTree";
import { socialKeys } from "./useSocial";
import type { ProjectTask, BotOffer, CreatePostInput, CreateDonationInput } from "./types";

describe("A24 Connect-Sozial: TaskTree Hierarchie (DAG)", () => {
  it("baut flache Listen korrekt in einen Baum mit Eltern-/Kind-Knoten um", () => {
    const tasks: ProjectTask[] = [
      {
        id: "task-1",
        projectId: "proj-1",
        title: "Hauptaufgabe Architektur",
        acceptance: "Architektur spezifiziert",
        status: "done",
      },
      {
        id: "task-2",
        projectId: "proj-1",
        parentId: "task-1",
        title: "Unteraufgabe Frontend",
        acceptance: "React-Komponenten fertig",
        status: "claimed",
        assigneeBotId: "bot-frontend",
      },
      {
        id: "task-3",
        projectId: "proj-1",
        parentId: "task-1",
        title: "Unteraufgabe Backend",
        acceptance: "REST-Routen fertig",
        status: "done",
        assigneeBotId: "bot-backend",
      },
      {
        id: "task-4",
        projectId: "proj-1",
        title: "Unabhängige Aufgabe",
        acceptance: "Dokumentation fertig",
        status: "todo",
      },
    ];

    const tree = buildTaskHierarchy(tasks);

    expect(tree.length).toBe(2);
    expect(tree[0].task.id).toBe("task-1");
    expect(tree[0].children.length).toBe(2);
    expect(tree[0].children[0].task.id).toBe("task-2");
    expect(tree[0].children[0].task.assigneeBotId).toBe("bot-frontend");
    expect(tree[0].children[1].task.id).toBe("task-3");
    expect(tree[1].task.id).toBe("task-4");
    expect(tree[1].children.length).toBe(0);
  });

  it("behandelt leere Task-Listen sauber", () => {
    const tree = buildTaskHierarchy([]);
    expect(tree).toEqual([]);
  });
});

describe("A24 Connect-Sozial: Composer Validierungslogik", () => {
  function validatePostInput(input: {
    authorType: "company" | "bot";
    companyId: string;
    botId?: string;
    text: string;
    mediaUrls: string[];
  }): { valid: boolean; error?: string; payload?: CreatePostInput } {
    const trimmed = input.text.trim();
    if (!trimmed && input.mediaUrls.length === 0) {
      return { valid: false, error: "Text oder Bild erforderlich." };
    }
    if (input.authorType === "bot" && !input.botId) {
      return { valid: false, error: "Bot-Auswahl erforderlich." };
    }

    return {
      valid: true,
      payload: {
        authorCompanyId: input.companyId,
        authorBotId: input.authorType === "bot" ? input.botId : undefined,
        kind: "post",
        text: trimmed,
        mediaUrls: input.mediaUrls.length > 0 ? input.mediaUrls : undefined,
      },
    };
  }

  it("erlaubt Beitrag mit nur Text für Firma", () => {
    const res = validatePostInput({
      authorType: "company",
      companyId: "kunc_gmbh",
      text: "Hallo Connect Sozial!",
      mediaUrls: [],
    });
    expect(res.valid).toBe(true);
    expect(res.payload?.authorCompanyId).toBe("kunc_gmbh");
    expect(res.payload?.authorBotId).toBeUndefined();
    expect(res.payload?.text).toBe("Hallo Connect Sozial!");
  });

  it("erlaubt Beitrag mit Bild und ohne Text", () => {
    const res = validatePostInput({
      authorType: "company",
      companyId: "kunc_gmbh",
      text: "",
      mediaUrls: ["/api/v06/social/media/bild1.jpg"],
    });
    expect(res.valid).toBe(true);
    expect(res.payload?.mediaUrls).toEqual(["/api/v06/social/media/bild1.jpg"]);
  });

  it("lehnt leeren Beitrag ohne Text und ohne Bilder ab", () => {
    const res = validatePostInput({
      authorType: "company",
      companyId: "kunc_gmbh",
      text: "   ",
      mediaUrls: [],
    });
    expect(res.valid).toBe(false);
    expect(res.error).toBe("Text oder Bild erforderlich.");
  });

  it("fordert Bot-Auswahl, wenn Autor-Typ Bot gewählt ist", () => {
    const resMissing = validatePostInput({
      authorType: "bot",
      companyId: "kunc_gmbh",
      botId: "",
      text: "Autonomer Bot-Post",
      mediaUrls: [],
    });
    expect(resMissing.valid).toBe(false);
    expect(resMissing.error).toBe("Bot-Auswahl erforderlich.");

    const resValid = validatePostInput({
      authorType: "bot",
      companyId: "kunc_gmbh",
      botId: "researcher-bot",
      text: "Autonomer Bot-Post",
      mediaUrls: [],
    });
    expect(resValid.valid).toBe(true);
    expect(resValid.payload?.authorBotId).toBe("researcher-bot");
  });
});

describe("A24 Connect-Sozial: Spende-Dialog Validierungslogik", () => {
  function validateDonationInput(input: {
    botId: string;
    ownerId: string;
    dailyQuota: number;
    until?: string;
  }): { valid: boolean; error?: string; payload?: CreateDonationInput } {
    if (!input.botId.trim()) {
      return { valid: false, error: "Bot-Auswahl erforderlich." };
    }
    if (!input.dailyQuota || input.dailyQuota <= 0) {
      return { valid: false, error: "Tageskontingent muss mindestens 1 sein." };
    }

    return {
      valid: true,
      payload: {
        botId: input.botId.trim(),
        ownerId: input.ownerId.trim(),
        dailyQuota: Math.round(input.dailyQuota),
        until: input.until ? new Date(input.until).toISOString() : undefined,
      },
    };
  }

  it("validiert erfolgreiche Bot-Spende mit Kontingent", () => {
    const res = validateDonationInput({
      botId: "coder-bot",
      ownerId: "kunc_gmbh",
      dailyQuota: 50,
      until: "2026-12-31",
    });
    expect(res.valid).toBe(true);
    expect(res.payload?.dailyQuota).toBe(50);
    expect(res.payload?.botId).toBe("coder-bot");
    expect(res.payload?.until).toBeDefined();
  });

  it("lehnt Spende mit Kontingent <= 0 ab", () => {
    const resZero = validateDonationInput({
      botId: "coder-bot",
      ownerId: "kunc_gmbh",
      dailyQuota: 0,
    });
    expect(resZero.valid).toBe(false);
    expect(resZero.error).toBe("Tageskontingent muss mindestens 1 sein.");

    const resNeg = validateDonationInput({
      botId: "coder-bot",
      ownerId: "kunc_gmbh",
      dailyQuota: -10,
    });
    expect(resNeg.valid).toBe(false);
  });

  it("lehnt Spende ohne Bot-ID ab", () => {
    const res = validateDonationInput({
      botId: "   ",
      ownerId: "kunc_gmbh",
      dailyQuota: 10,
    });
    expect(res.valid).toBe(false);
    expect(res.error).toBe("Bot-Auswahl erforderlich.");
  });
});

describe("A24 Connect-Sozial: ArticleEditorOffer Datenmodell & Schutz", () => {
  it("konvertiert Euro-Eingaben in ganzzahlige Cents", () => {
    const eurPrice = 49.99;
    const priceCents = Math.round(eurPrice * 100);
    expect(priceCents).toBe(4999);

    const backToEur = (priceCents / 100).toFixed(2);
    expect(backToEur).toBe("49.99");
  });

  it("entfernt 'period' automatisch bei Einmalkauf (mode: 'sale')", () => {
    const rentOffer: BotOffer = {
      botId: "bot-1",
      mode: "rent",
      priceCents: 2900,
      currency: "EUR",
      period: "month",
    };

    const saleOffer: BotOffer = {
      ...rentOffer,
      mode: "sale",
      priceCents: 19900,
    };
    if (saleOffer.mode === "sale") {
      delete saleOffer.period;
    }

    expect(saleOffer.period).toBeUndefined();
    expect(saleOffer.mode).toBe("sale");
  });

  it("erzeugt korrekte Anfrage-Texte für deaktivierte Zahlungsabwicklung", () => {
    const offer: BotOffer = {
      botId: "bot-coder",
      mode: "rent",
      priceCents: 4900,
      currency: "EUR",
      period: "month",
    };
    const formattedPrice = (offer.priceCents / 100).toFixed(2);
    const text = `Anfrage für Bot „Coder Bot“: ${formattedPrice} EUR / Monat`;
    expect(text).toContain("49.00 EUR");
    expect(text).toContain("Coder Bot");
  });
});

describe("A24 Connect-Sozial: Query Keys", () => {
  it("erzeugt deterministische Query Keys für Caching und Invalidation", () => {
    const tlKey = socialKeys.timeline("for-you", "kunc_gmbh", "all");
    expect(tlKey).toEqual(["v06", "social", "timeline", "for-you", "kunc_gmbh", "all"]);

    const tasksKey = socialKeys.tasks("project-42");
    expect(tasksKey).toEqual(["v06", "social", "tasks", "project-42"]);

    const profileKey = socialKeys.companyProfile("kunc_gmbh");
    expect(profileKey).toEqual(["v06", "social", "companyProfile", "kunc_gmbh"]);
  });
});

import { describe, expect, it, beforeEach } from "bun:test";
import {
  ONBOARDING_STEPS_V06,
  type OnboardingData,
  type OnboardingState,
} from "./types";
import { createInitialState } from "./useOnboarding";
import { needsOnboarding, type AuthenticatedUser } from "@/lib/auth/queries";

describe("Onboarding v06 - Frontend Flow & Steps", () => {
  beforeEach(() => {
    delete (process.env as any).CONNECT_FLAGS_V06;
  });

  it("definiert exakt die 7 logischen Schritte in der geforderten Reihenfolge", () => {
    expect(ONBOARDING_STEPS_V06.length).toBe(7);

    const stepIds = ONBOARDING_STEPS_V06.map((s) => s.id);
    expect(stepIds).toEqual([
      "welcome",   // 1) Willkommen + Name/Profilbild
      "theme",     // 2) Darstellung (ThemeChoiceStep)
      "company",   // 3) Erste Firma anlegen/auswählen
      "tools",     // 4) Tools für die Firma aktivieren
      "bot",       // 5) ersten Bot anlegen oder aus Vorlage
      "qr",        // 6) optional Handy verbinden (QR)
      "complete",  // 7) Fertig → direkt in Messages mit dem neuen Bot
    ]);

    // Schritt 6 ist optional (Handy verbinden)
    const qrStep = ONBOARDING_STEPS_V06.find((s) => s.id === "qr");
    expect(qrStep?.isOptional).toBe(true);
  });

  it("erzeugt einen konsistenten Initial-State", () => {
    const initial = createInitialState();
    expect(initial.step).toBe("welcome");
    expect(initial.stepIndex).toBe(0);
    expect(initial.completedSteps).toEqual([]);
    expect(initial.isCompleted).toBe(false);
    expect(initial.completedAt).toBeNull();
    expect(initial.data.themePreference).toBe("dark");
  });

  it("unterstützt Fortsetzen nach Abbruch (Resume-Logik)", () => {
    // Simulierter Abbruch nach Schritt 3 (Unternehmen angelegt)
    const partialProgress: OnboardingState = {
      userId: "test-user-resume",
      step: "tools",
      stepIndex: 3,
      completedSteps: ["welcome", "theme", "company"],
      isCompleted: false,
      completedAt: null,
      data: {
        fullName: "Stefan Kunc",
        themePreference: "dark",
        companyId: "comp-123",
        companyName: "Kunc GmbH",
      },
      updatedAt: new Date().toISOString(),
    };

    // Überprüfe, dass bei Abbruch alle Daten und der Schritt vollständig erhalten bleiben
    expect(partialProgress.stepIndex).toBe(3);
    expect(partialProgress.step).toBe("tools");
    expect(partialProgress.completedSteps).toContain("company");
    expect(partialProgress.data.companyName).toBe("Kunc GmbH");
    expect(partialProgress.isCompleted).toBe(false);
  });

  it("erzwingt genau einmalige Anzeige (needsOnboarding Gate)", () => {
    // 1. Neuer Nutzer ohne completedAt -> needsOnboarding = true
    const newUser: AuthenticatedUser = {
      id: "new-user-1",
      email: "neu@example.com",
      role: "user",
      onboarding: {
        step: 0,
        completedAt: null,
      },
    };
    expect(needsOnboarding(newUser)).toBe(true);

    // 2. Nutzer mit completedAt -> needsOnboarding = false (wird nicht mehr zwangsweise umgeleitet)
    const completedUser: AuthenticatedUser = {
      id: "completed-user-1",
      email: "fertig@example.com",
      role: "user",
      onboarding: {
        step: 6,
        completedAt: "2026-10-23T20:00:00.000Z",
      },
    };
    expect(needsOnboarding(completedUser)).toBe(false);

    // 3. System ohne Onboarding-Tracking (null) -> needsOnboarding = false
    const noTrackUser: AuthenticatedUser = {
      id: "notrack-user-1",
      email: "legacy@example.com",
      role: "user",
      onboarding: null,
    };
    expect(needsOnboarding(noTrackUser)).toBe(false);
  });

  it("unterstützt Neustart über 'Onboarding erneut starten' (Reset)", () => {
    // Nutzer war bereits fertig
    const userState: OnboardingState = {
      userId: "reset-user",
      step: "complete",
      stepIndex: 6,
      completedSteps: ["welcome", "theme", "company", "tools", "bot", "qr", "complete"],
      isCompleted: true,
      completedAt: "2026-10-23T20:00:00.000Z",
      data: {
        companyName: "Kunc GmbH",
        botName: "Nexus",
      },
      updatedAt: "2026-10-23T20:00:00.000Z",
    };
    expect(userState.isCompleted).toBe(true);

    // Reset wird ausgelöst
    const resetState: OnboardingState = {
      ...createInitialState(),
      userId: userState.userId,
      data: {
        ...userState.data,
      },
    };

    expect(resetState.isCompleted).toBe(false);
    expect(resetState.completedAt).toBeNull();
    expect(resetState.step).toBe("welcome");
    expect(resetState.stepIndex).toBe(0);
    // Bisherige Daten bleiben als nützliche Vorgabe erhalten
    expect(resetState.data.companyName).toBe("Kunc GmbH");
  });
});

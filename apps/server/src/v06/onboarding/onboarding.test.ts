import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";
import {
  getOnboardingState,
  updateOnboardingState,
  clearInMemoryOnboardingStore,
} from "./state";
import { createOnboardingRouter, registerOnboardingRoutes } from "./routes";

describe("Onboarding v06 State & Routes", () => {
  beforeEach(() => {
    clearInMemoryOnboardingStore();
    delete process.env.CONNECT_FLAGS_V06;
  });

  it("liefert sauberen Default-State fuer neuen Benutzer", async () => {
    const state = await getOnboardingState(null, "user-123");

    expect(state.userId).toBe("user-123");
    expect(state.step).toBe("welcome");
    expect(state.stepIndex).toBe(0);
    expect(state.completedSteps).toEqual([]);
    expect(state.isCompleted).toBe(false);
    expect(state.completedAt).toBeNull();
    expect(state.data.themePreference).toBe("dark");
  });

  it("speichert Fortschritt und Formulardaten Schritt fuer Schritt (Abbruch & Fortsetzen)", async () => {
    const userId = "user-progress-test";

    // Schritt 1 abgeschlossen -> Schritt 2
    const step1State = await updateOnboardingState(null, userId, {
      step: "theme",
      stepIndex: 1,
      completedSteps: ["welcome"],
      data: { fullName: "Stefan Kunc" },
    });

    expect(step1State.step).toBe("theme");
    expect(step1State.stepIndex).toBe(1);
    expect(step1State.completedSteps).toEqual(["welcome"]);
    expect(step1State.data.fullName).toBe("Stefan Kunc");

    // Simulierter Abbruch & Fortsetzen: Status erneut abrufen
    const resumedState = await getOnboardingState(null, userId);
    expect(resumedState.step).toBe("theme");
    expect(resumedState.stepIndex).toBe(1);
    expect(resumedState.completedSteps).toEqual(["welcome"]);
    expect(resumedState.data.fullName).toBe("Stefan Kunc");

    // Schritt 2 abgeschlossen -> Schritt 3
    const step2State = await updateOnboardingState(null, userId, {
      step: "company",
      stepIndex: 2,
      completedSteps: ["welcome", "theme"],
      data: { themePreference: "dark" },
    });

    expect(step2State.step).toBe("company");
    expect(step2State.stepIndex).toBe(2);
    expect(step2State.data.fullName).toBe("Stefan Kunc");
    expect(step2State.data.themePreference).toBe("dark");
  });

  it("schließt Onboarding ab und markiert isCompleted = true mit Timestamp", async () => {
    const userId = "user-complete-test";

    const completedState = await updateOnboardingState(null, userId, {
      step: "complete",
      stepIndex: 6,
      completedSteps: ["welcome", "theme", "company", "tools", "bot", "qr"],
      isCompleted: true,
      data: {
        companyName: "Kunc GmbH",
        botName: "Nexus",
      },
    });

    expect(completedState.isCompleted).toBe(true);
    expect(completedState.completedAt).not.toBeNull();
    expect(typeof completedState.completedAt).toBe("string");
  });

  it("kann Onboarding komplett zuruecksetzen (Reset / Neustart)", async () => {
    const userId = "user-reset-test";

    // Zuerst abschließen
    await updateOnboardingState(null, userId, {
      isCompleted: true,
      step: "complete",
      stepIndex: 6,
    });

    // Reset ausführen
    const reset = await updateOnboardingState(null, userId, { reset: true });
    expect(reset.isCompleted).toBe(false);
    expect(reset.completedAt).toBeNull();
    expect(reset.step).toBe("welcome");
    expect(reset.stepIndex).toBe(0);
    expect(reset.completedSteps).toEqual([]);
  });

  it("blockiert Hono-Routen mit 404 wenn Flag onboardingV2 deaktiviert ist", async () => {
    const app = new Hono();
    registerOnboardingRoutes(app);

    const res = await app.request("/api/v06/onboarding/state");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("onboardingV2");
  });

  it("beantwortet GET und POST auf /api/v06/onboarding/state wenn Flag aktiviert ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "onboardingV2";

    const app = new Hono();
    registerOnboardingRoutes(app);

    // 1. GET State
    const getRes = await app.request("/api/v06/onboarding/state", {
      headers: { "x-connect-user-id": "http-user-1" },
    });
    expect(getRes.status).toBe(200);
    const initial = await getRes.json();
    expect(initial.userId).toBe("http-user-1");
    expect(initial.step).toBe("welcome");

    // 2. POST State
    const postRes = await app.request("/api/v06/onboarding/state", {
      method: "POST",
      headers: {
        "x-connect-user-id": "http-user-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        step: "theme",
        stepIndex: 1,
        completedSteps: ["welcome"],
        data: { fullName: "Alice Tester" },
      }),
    });
    expect(postRes.status).toBe(200);
    const updated = await postRes.json();
    expect(updated.step).toBe("theme");
    expect(updated.stepIndex).toBe(1);
    expect(updated.data.fullName).toBe("Alice Tester");
  });
});

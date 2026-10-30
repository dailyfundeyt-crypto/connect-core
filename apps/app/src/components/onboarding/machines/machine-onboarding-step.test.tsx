/**
 * Tests für den Onboarding-Schritt „Lokale Cua-Maschine“ (Lane A26)
 *
 * AKZEPTANZKRITERIEN:
 * 1. Render-Tests aller Zustände:
 *    - prompt (keine Zustimmung / initial)
 *    - installing (Installation läuft)
 *    - ready (installiert / bereit)
 *    - error (Fehler)
 * 2. Ohne Zustimmung kein Installationsaufruf!
 * 3. Mit vorhandenem Consent wird kein Onboarding-Prompt gezeigt (übersprungen).
 * 4. Klick schreibt machine_install_consent (recorded_by: "user").
 */

import { ensureDom } from "@/test/dom";
ensureDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
const { cleanup, fireEvent, render, screen, waitFor } = await import(
  "@testing-library/react"
);
import { MachineOnboardingStep } from "./index";
import {
  resetMockMachinesStore,
  getConsentStatus,
} from "@/components/settings/machines/machines-api";

beforeEach(() => {
  resetMockMachinesStore();
});

afterEach(() => {
  cleanup();
});

describe("A26: MachineOnboardingStep", () => {
  test("Render-Test Zustand: PROMPT (keine Zustimmung vorhanden)", async () => {
    const { container } = render(
      <MachineOnboardingStep
        initialPhase="prompt"
        hasExistingConsent={false}
        mock={true}
      />,
    );

    // Erklärung sichtbar
    expect(container.textContent).toContain("Lokale Cua-Sandbox für Ihre Bots");
    expect(container.textContent).toContain("Hauptsystem vollständig geschützt");

    // Vorprüfung (Preflight)
    expect(container.textContent).toContain("System-Vorprüfung");
    expect(container.textContent).toContain("WSL2 / Hyper-V");
    expect(container.textContent).toContain("Virtualisierung");

    // Checkbox & Button
    expect(container.textContent).toContain("Automatisch eine kleine Standard-Maschine installieren");
    expect(container.textContent).toContain("Lokale Maschine installieren");
  });

  test("Render-Test Zustand: INSTALLING (Installation läuft)", () => {
    const { container } = render(
      <MachineOnboardingStep initialPhase="installing" mock={true} />,
    );

    expect(container.textContent).toContain("Maschine wird eingerichtet…");
    expect(container.textContent).toContain("Sandbox-Container wird erstellt");
  });

  test("Render-Test Zustand: READY (Installiert / Bereit)", () => {
    let continued = false;
    const { container, getByText } = render(
      <MachineOnboardingStep
        initialPhase="ready"
        onContinue={() => {
          continued = true;
        }}
        mock={true}
      />,
    );

    expect(container.textContent).toContain("Maschine wird eingerichtet / bereit");
    expect(container.textContent).toContain("Bereit (Schläft stromsparend)");
    expect(container.textContent).toContain("Weiter zum nächsten Schritt");

    // Weiter-Button anklicken
    fireEvent.click(getByText("Weiter zum nächsten Schritt"));
    expect(continued).toBe(true);
  });

  test("Render-Test Zustand: ERROR (Fehler)", () => {
    const { container } = render(
      <MachineOnboardingStep initialPhase="error" mock={true} />,
    );

    expect(container.textContent).toContain("Einrichtung fehlgeschlagen");
    expect(container.textContent).toContain("Erneut versuchen");
  });

  test("AKZEPTANZKRITERIUM: Ohne Zustimmung kein Installationsaufruf", async () => {
    // Rendere den Onboarding-Schritt im Prompt-Modus
    const { container } = render(
      <MachineOnboardingStep
        initialPhase="prompt"
        hasExistingConsent={false}
        mock={true}
      />,
    );

    // Der Benutzer sieht den Prompt, klickt aber NICHT auf "Lokale Maschine installieren"
    expect(container.textContent).toContain("Lokale Maschine installieren");

    // Vor dem Klick darf absolut kein Consent hinterlegt sein!
    const consentBefore = await getConsentStatus({ mock: true });
    expect(consentBefore.hasConsent).toBe(false);
  });

  test("AKZEPTANZKRITERIUM: Mit vorhandenem Consent wird kein Onboarding-Prompt gezeigt", async () => {
    // Bei bestehendem Consent (z. B. Admin-protokolliert durch Stefan via Migration 0571)
    const { container } = render(
      <MachineOnboardingStep
        hasExistingConsent={true}
        mock={true}
      />,
    );

    // Der Onboarding-Prompt darf NICHT angezeigt werden
    await waitFor(() => {
      expect(container.textContent).not.toContain("Lokale Maschine installieren");
      expect(container.textContent).not.toContain("Automatisch eine kleine Standard-Maschine installieren");

      // Stattdessen wird direkt die Bereit-Meldung gezeigt
      expect(container.textContent).toContain("Maschine wird eingerichtet / bereit");
      expect(container.textContent).toContain("Zustimmung liegt bereits vor");
      expect(container.textContent).toContain("Weiter zum nächsten Schritt");
    });
  });

  test("AKZEPTANZKRITERIUM: Klick schreibt machine_install_consent (recorded_by: user) und installiert Maschine", async () => {
    const { getByText } = render(
      <MachineOnboardingStep
        initialPhase="prompt"
        hasExistingConsent={false}
        mock={true}
      />,
    );

    // Vorher kein Consent
    const consentBefore = await getConsentStatus({ mock: true });
    expect(consentBefore.hasConsent).toBe(false);

    // Klick auf "Lokale Maschine installieren"
    const installBtn = getByText("Lokale Maschine installieren");
    fireEvent.click(installBtn);

    // Nach dem Klick muss Consent erteilt und auf ready umgeschaltet sein
    await waitFor(async () => {
      const consentAfter = await getConsentStatus({ mock: true });
      expect(consentAfter.hasConsent).toBe(true);
      expect(consentAfter.recordedBy).toBe("user");
      expect(document.body.textContent).toContain("Maschine wird eingerichtet / bereit");
    });
  });
});

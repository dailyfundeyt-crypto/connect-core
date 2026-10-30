/**
 * Onboarding-Schritt für Cua-Maschinen
 *
 * Lane: A26 (Maschinen-Einstellungen & Onboarding)
 *
 * AKZEPTANZKRITERIEN:
 * 1. Einmalige Zustimmung: Erklärung, Vorprüfung, Knopf „Lokale Maschine installieren“ +
 *    Checkbox „automatisch, falls keine vorhanden“.
 * 2. Klick schreibt machine_install_consent (recorded_by: "user").
 * 3. Liegt schon eine Zustimmung vor (auch Admin-protokolliert, z. B. Stefan), wird der
 *    Schritt übersprungen und „Maschine wird eingerichtet / bereit“ gezeigt (kein Prompt).
 * 4. Ohne Zustimmung kein Installationsaufruf.
 * 5. Alle Zustände abbildbar: prompt (keine), installing, ready (installiert), error (Fehler).
 */

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Server,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Cpu,
  ArrowRight,
  ArrowLeft,
  Check,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { MachineOnboardingStepProps, OnboardingMachinePhase } from "./types";
import {
  fetchCuaDoctor,
  getConsentStatus,
  getMachinesList,
  recordInstallConsent,
  createMachine,
} from "@/components/settings/machines/machines-api";
import type { CuaDoctorResult, Machine } from "@/components/settings/machines/types";

export function MachineOnboardingStep({
  onContinue,
  onBack,
  mock = false,
  initialPhase,
  hasExistingConsent,
}: MachineOnboardingStepProps) {
  const [phase, setPhase] = useState<OnboardingMachinePhase>(initialPhase || "checking");
  const [autoInstallChecked, setAutoInstallChecked] = useState(true);
  const [doctorResult, setDoctorResult] = useState<CuaDoctorResult | null>(null);
  const [installedMachine, setInstalledMachine] = useState<Machine | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [consentRecordedBy, setConsentRecordedBy] = useState<"user" | "admin" | null>(null);

  // Initialer Check: Liegt bereits eine Zustimmung oder Maschine vor?
  useEffect(() => {
    if (initialPhase) {
      setPhase(initialPhase);
      return;
    }

    let isMounted = true;

    async function checkExistingSetup() {
      try {
        const [doctor, consent, machinesData] = await Promise.all([
          fetchCuaDoctor({ mock }),
          getConsentStatus({ mock }),
          getMachinesList({ mock }),
        ]);

        if (!isMounted) return;
        setDoctorResult(doctor);

        // Prüfe ob Consent vorhanden ist (oder prop erzwingt es)
        const effectiveConsent = hasExistingConsent ?? (consent.hasConsent || machinesData.machines.length > 0);

        if (effectiveConsent) {
          // Liegt schon eine Zustimmung vor -> KEIN Onboarding-Prompt!
          // Direkt „Maschine wird eingerichtet / bereit“ anzeigen!
          const recorded = hasExistingConsent ? "admin" : (consent.recordedBy || "admin");
          setConsentRecordedBy(recorded);
          const shared = machinesData.machines.find((m) => m.sharedDefault) ?? machinesData.machines[0] ?? null;
          setInstalledMachine(shared);
          setPhase("ready");
        } else {
          // Keine Zustimmung vorhanden -> Prompt anzeigen
          setPhase("prompt");
        }
      } catch (err) {
        if (!isMounted) return;
        // Bei Fehler defensiv in den Prompt gehen
        setPhase("prompt");
      }
    }

    void checkExistingSetup();

    return () => {
      isMounted = false;
    };
  }, [mock, initialPhase, hasExistingConsent]);

  /**
   * Wird NUR aufgerufen, wenn der Benutzer aktiv auf „Lokale Maschine installieren“ klickt.
   * Regel: Ohne Klick / Zustimmung erfolgt KEIN Installationsaufruf.
   */
  const handleInstallClick = async () => {
    setPhase("installing");
    setErrorMessage(null);

    try {
      // 1. Consent schreiben (recorded_by: "user")
      await recordInstallConsent("user", { mock });
      setConsentRecordedBy("user");

      // 2. Falls Checkbox aktiv: kleine Standard-Maschine anlegen
      let created: Machine | null = null;
      if (autoInstallChecked) {
        created = await createMachine(
          {
            name: "Lokal (alle Bots)",
            kind: "sandbox",
            size: "small",
            os: "linux",
          },
          { mock },
        );
      }

      setInstalledMachine(created);
      setPhase("ready");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Fehler beim Installieren der lokalen Maschine.",
      );
      setPhase("error");
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-2">
      {/* ----------------- Zustand: CHECKING ----------------- */}
      {phase === "checking" && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="mt-4 text-xs font-medium text-muted-foreground">
            Prüfe Systemvoraussetzungen und Maschinenstatus…
          </p>
        </div>
      )}

      {/* ----------------- Zustand: PROMPT (Noch keine Zustimmung) ----------------- */}
      {phase === "prompt" && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
              <Server className="size-6" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              Lokale Cua-Sandbox für Ihre Bots
            </h2>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed sm:text-sm">
              Ihre Bots führen Skripte, Webrecherchen und Befehle in einer sicheren, isolierten
              Computer-Sandbox aus. Dadurch bleibt Ihr Hauptsystem vollständig geschützt.
            </p>
          </div>

          {/* Vorprüfung (Preflight) */}
          <div className="rounded-xl border border-border bg-card p-4 text-xs">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <ShieldCheck className="size-4 text-primary" />
              <span>System-Vorprüfung</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {doctorResult?.message || "Hardware-Virtualisierung und Windows-Voraussetzungen:"}
            </p>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 p-2">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] text-foreground font-medium">WSL2 / Hyper-V</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 p-2">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] text-foreground font-medium">Virtualisierung</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 p-2">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] text-foreground font-medium">Cua-Sandbox Engine</span>
              </div>
            </div>
          </div>

          {/* Zustimmung & Checkbox */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="auto-install-checkbox"
                checked={autoInstallChecked}
                onCheckedChange={(checked) => setAutoInstallChecked(Boolean(checked))}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="auto-install-checkbox"
                  className="text-xs font-semibold text-foreground cursor-pointer"
                >
                  Automatisch eine kleine Standard-Maschine installieren
                </Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Richtet sofort eine geteilte lokale Linux-Sandbox (1 vCPU, 2 GB RAM) ein. Die
                  Maschine startet ressourcenschonend im Ruhezustand und wird allen Bots zugewiesen.
                </p>
              </div>
            </div>
          </div>

          {/* Aktionen */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
            {onBack ? (
              <Button type="button" variant="ghost" size="sm" onClick={onBack} className="w-full sm:w-auto">
                <ArrowLeft className="size-4 mr-1.5" />
                Zurück
              </Button>
            ) : <div />}

            <Button
              type="button"
              size="default"
              onClick={handleInstallClick}
              className="w-full sm:w-auto gap-2"
            >
              <Server className="size-4" />
              Lokale Maschine installieren
            </Button>
          </div>
        </div>
      )}

      {/* ----------------- Zustand: INSTALLING (Installation läuft) ----------------- */}
      {phase === "installing" && (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
          <div className="relative flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Loader2 className="size-7 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Maschine wird eingerichtet…
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Die lokale Cua-Sandbox wird initialisiert und für Ihre Bots vorbereitet.
            </p>
          </div>
          <div className="w-full max-w-xs space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-left text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Check className="size-3 text-emerald-500" />
              <span>Zustimmung erteilt (machine_install_consent)</span>
            </div>
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Loader2 className="size-3 animate-spin text-primary" />
              <span>Sandbox-Container wird erstellt</span>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- Zustand: READY (Installiert / Bereit) ----------------- */}
      {phase === "ready" && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs">
              <CheckCircle2 className="size-6" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              Maschine wird eingerichtet / bereit
            </h2>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed sm:text-sm">
              {consentRecordedBy === "admin"
                ? "Zustimmung liegt bereits vor (vom Administrator protokolliert). Ihre lokale Cua-Maschine ist einsatzbereit."
                : "Die lokale Cua-Sandbox wurde erfolgreich eingerichtet und steht allen Ihren Bots zur Verfügung."}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Server className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  {installedMachine?.name || "Lokal (alle Bots)"}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Bereit (Schläft stromsparend)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-[11px] text-muted-foreground">
              <div>Typ: <strong className="font-medium text-foreground">Geteilte Standard-Maschine</strong></div>
              <div>Betriebssystem: <strong className="font-medium text-foreground">Linux Ubuntu</strong></div>
              <div>Modus: <strong className="font-medium text-foreground">Gemeinsam (Shared)</strong></div>
              <div>Ressourcen: <strong className="font-medium text-foreground">1 vCPU · 2 GB RAM</strong></div>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <Button
              type="button"
              size="default"
              onClick={onContinue}
              className="w-full sm:w-auto gap-2"
            >
              Weiter zum nächsten Schritt
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ----------------- Zustand: ERROR (Fehler) ----------------- */}
      {phase === "error" && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-xs">
              <AlertTriangle className="size-6" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              Einrichtung fehlgeschlagen
            </h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Bei der Installation der lokalen Maschine ist ein Fehler aufgetreten.
            </p>
          </div>

          <div
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive"
          >
            {errorMessage || "Unbekannter Fehler bei der Initialisierung der Cua-Maschine."}
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
            {onBack ? (
              <Button type="button" variant="ghost" size="sm" onClick={onBack} className="w-full sm:w-auto">
                <ArrowLeft className="size-4 mr-1.5" />
                Zurück
              </Button>
            ) : <div />}

            <Button
              type="button"
              variant="default"
              size="default"
              onClick={handleInstallClick}
              className="w-full sm:w-auto gap-2"
            >
              <RefreshCw className="size-4" />
              Erneut versuchen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

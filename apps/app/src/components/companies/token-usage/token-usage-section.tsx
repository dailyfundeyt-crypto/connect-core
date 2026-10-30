/**
 * Einbausektion für das Firmenprofil (Lane A35).
 *
 * A39 hängt diese Komponente in `company-profile-x.tsx` ein:
 *
 *   <CompanyTokenUsageSection companyId={company.id} isAdmin={isCompanyAdmin} />
 *
 * Sie kapselt Laden/Speichern und rendert:
 *   1. das öffentliche Widget (alle Besucher),
 *   2. die Admin-Schalter (nur `isAdmin`).
 *
 * Hinter dem A01-Flag `companyPublicUsage`; Flag aus = `null` (altes Profil unverändert).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getT3Flag } from "@/lib/t3/contracts";
import { loadPublicUsage, loadVisibility, saveVisibility } from "./api";
import {
  TokenUsageAdminControls,
  type TokenUsageVisibilityKey,
} from "./token-usage-admin-controls";
import { TokenUsageWidget } from "./token-usage-widget";
import type {
  CompanyPublicUsage,
  CompanyUsageSettings,
  PublicUsageResult,
  TokenUsagePoint,
  TokenUsageViewState,
} from "./types";

export type CompanyTokenUsageSectionProps = {
  companyId: string;
  /** Firmen-Admin? Nur dann erscheinen die Schalter. */
  isAdmin?: boolean;
  /** Mock-Daten statt Server (Tests, Vorschau ohne A37-Mounting). */
  mock?: boolean;
  /** Erzwingt die Anzeige unabhängig vom Feature-Flag (Tests, Vorschau). */
  forceFlag?: boolean;
  /** Tageswerte für die Verlaufslinie (A20 liefert derzeit nur Summen). */
  history?: TokenUsagePoint[];
  className?: string;
};

export function CompanyTokenUsageSection({
  companyId,
  isAdmin = false,
  mock = false,
  forceFlag,
  history,
  className,
}: CompanyTokenUsageSectionProps) {
  const enabled =
    typeof forceFlag === "boolean"
      ? forceFlag
      : getT3Flag("companyPublicUsage");

  const [usage, setUsage] = useState<CompanyPublicUsage | null>(null);
  const [viewState, setViewState] = useState<TokenUsageViewState>("loading");
  const [settings, setSettings] = useState<CompanyUsageSettings | null>(null);
  const [visibilityState, setVisibilityState] = useState<
    "loading" | "ready" | "forbidden" | "error"
  >("loading");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyUsageResult = useCallback((result: PublicUsageResult) => {
    if (!mounted.current) return;
    if (result.status === "public") {
      setUsage(result.usage);
      setViewState(result.usage.totalTokens > 0 ? "ready" : "empty");
      return;
    }
    setUsage(null);
    setViewState(result.status === "private" ? "private" : "error");
  }, []);

  useEffect(() => {
    if (!enabled || !companyId) return;
    const controller = new AbortController();
    setViewState("loading");
    void loadPublicUsage(companyId, { mock, signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        applyUsageResult(result);
      },
    );
    return () => controller.abort();
  }, [applyUsageResult, companyId, enabled, mock]);

  useEffect(() => {
    if (!enabled || !isAdmin || !companyId) {
      setSettings(null);
      return;
    }
    const controller = new AbortController();
    setVisibilityState("loading");
    void loadVisibility(companyId, { mock, signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted || !mounted.current) return;
        if (result.status === "ok") {
          setSettings(result.settings);
          setVisibilityState("ready");
          return;
        }
        setSettings(null);
        if (result.status === "forbidden") {
          setVisibilityState("forbidden");
          return;
        }
        setVisibilityState("error");
        setAdminError(result.message);
      },
    );
    return () => controller.abort();
  }, [companyId, enabled, isAdmin, mock]);

  const handleToggle = useCallback(
    (key: TokenUsageVisibilityKey, value: boolean) => {
      if (!settings) return;
      const previous = settings;
      setAdminError(null);
      setAdminBusy(true);
      setSettings({ ...settings, [key]: value });

      void (async () => {
        try {
          const saved = await saveVisibility(
            companyId,
            { [key]: value },
            { mock },
          );
          if (!mounted.current) return;
          setSettings(saved);
          const result = await loadPublicUsage(companyId, { mock });
          applyUsageResult(result);
        } catch (error) {
          if (!mounted.current) return;
          setSettings(previous);
          setAdminError(
            error instanceof Error
              ? error.message
              : "Speichern fehlgeschlagen.",
          );
        } finally {
          if (mounted.current) setAdminBusy(false);
        }
      })();
    },
    [applyUsageResult, companyId, mock, settings],
  );

  if (!enabled) return null;

  return (
    <div className={className} data-testid="token-usage-section">
      <TokenUsageWidget
        forceFlag
        history={history}
        showCost={settings?.showCost}
        state={viewState}
        usage={usage}
      />
      {isAdmin && visibilityState !== "forbidden" ? (
        <TokenUsageAdminControls
          busy={adminBusy}
          className="mt-2"
          error={adminError}
          loading={visibilityState === "loading"}
          onToggle={handleToggle}
          settings={settings}
        />
      ) : null}
    </div>
  );
}

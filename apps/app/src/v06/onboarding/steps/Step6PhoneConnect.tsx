/**
 * Schritt 6: Optional Handy verbinden via QR (A25 / Wave 3)
 */

import * as React from "react";
import { Smartphone, QrCode, RefreshCw, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFlag } from "@/contracts/v06/flags";
import { Button as DesignButton } from "@/v06/design";
import "@/v06/design/tokens.css";
import type { OnboardingData } from "../types";

export interface Step6PhoneConnectProps {
  data: OnboardingData;
  onUpdateData: (patch: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
  onSkip?: () => void;
  isSaving?: boolean;
}

export function Step6PhoneConnect({
  data,
  onUpdateData,
  onContinue,
  onBack,
  onSkip,
  isSaving = false,
}: Step6PhoneConnectProps) {
  const [qrSvg, setQrSvg] = React.useState<string | null>(null);
  const [pairUrl, setPairUrl] = React.useState<string | null>(null);
  const [isLoadingQr, setIsLoadingQr] = React.useState(true);
  const [tunnelOnline, setTunnelOnline] = React.useState(false);

  const fetchPairing = React.useCallback(async () => {
    setIsLoadingQr(true);
    try {
      // Prüfe Tunnel Status
      const statusRes = await fetch("/api/tunnel/status", { credentials: "same-origin" }).catch(() => null);
      if (statusRes && statusRes.ok) {
        const s = await statusRes.json();
        setTunnelOnline(s.status === "online");
      }

      // Erzeuge Einmal-Pairing-Code
      const res = await fetch("/api/tunnel/pair", {
        method: "POST",
        headers: {
          "x-connect-tunnel": "1",
          "content-type": "application/json",
        },
        credentials: "same-origin",
        body: "{}",
      }).catch(() => null);

      if (res && res.ok) {
        const body = await res.json();
        if (body.qrSvg) {
          setQrSvg(body.qrSvg);
          setPairUrl(body.pairUrl || null);
          onUpdateData({ phoneConnected: true });
        }
      }
    } catch {
      /* Graceful fallback */
    } finally {
      setIsLoadingQr(false);
    }
  }, [onUpdateData]);

  React.useEffect(() => {
    void fetchPairing();
  }, [fetchPairing]);

  const isDesignV2 = getFlag("designV2");

  return (
    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto py-2 text-center select-none">
      <div className="relative mb-6">
        <div
          className={`size-16 flex items-center justify-center shadow-md transition-transform duration-300 hover:scale-105 ${
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] border border-[var(--p-accent)]/30 bg-[var(--p-accent)]/15 text-[var(--p-accent)] shadow-[0_0_24px_rgba(56,189,248,0.18)]"
              : "rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-4 shadow-sm"
          }`}
        >
          <Smartphone className={`size-8 ${isDesignV2 ? "text-[var(--p-accent)]" : ""}`} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <h1
          className={`text-2xl sm:text-3xl font-bold tracking-tight ${
            isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
          }`}
        >
          Handy verbinden
        </h1>
        <span
          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
            isDesignV2
              ? "bg-[var(--p-surface-3)] text-[var(--p-text-2)] border border-[var(--p-border)]"
              : "bg-muted text-muted-foreground border border-border"
          }`}
        >
          Optional
        </span>
      </div>

      <p
        className={`text-sm mt-2 max-w-md ${
          isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground"
        }`}
      >
        Scanne diesen QR-Code mit deinem Smartphone, um Connect mobil im WLAN oder unterwegs über Cloudflare Tunnel zu steuern.
      </p>

      {/* QR Code Container */}
      <div
        className={`mt-6 flex flex-col items-center justify-center p-6 max-w-xs w-full shadow-xs ${
          isDesignV2
            ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-md"
            : "rounded-2xl border border-border/80 bg-card/60"
        }`}
      >
        {isLoadingQr ? (
          <div
            className={`size-48 flex flex-col items-center justify-center gap-2 ${
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
            }`}
          >
            <RefreshCw className={`size-6 animate-spin ${isDesignV2 ? "text-[var(--p-accent)]" : "text-primary"}`} />
            <span className="text-xs">QR-Code wird generiert…</span>
          </div>
        ) : qrSvg ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className={`size-48 p-2 bg-white shadow-xs overflow-hidden flex items-center justify-center [&>svg]:size-full [&>svg]:w-full [&>svg]:h-full ${
                isDesignV2 ? "rounded-[var(--p-radius-md)] border border-[var(--p-border)]" : "rounded-xl"
              }`}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p
              className={`text-[11px] ${
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
              }`}
            >
              Gültig für 10 Minuten · Einmal-Token
            </p>
          </div>
        ) : (
          <div
            className={`size-48 flex flex-col items-center justify-center gap-2 p-3 ${
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
            }`}
          >
            <QrCode className="size-12 opacity-60" />
            <p
              className={`text-xs font-medium ${
                isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
              }`}
            >
              Lokal bereit
            </p>
            <p
              className={`text-[11px] text-center ${
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
              }`}
            >
              Kann jederzeit später unter Einstellungen › Handy verbinden gekoppelt werden.
            </p>
          </div>
        )}

        {pairUrl && (
          <p
            className={`text-[10px] mt-2 font-mono truncate max-w-[220px] ${
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground/80"
            }`}
          >
            {pairUrl}
          </p>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex flex-col items-center w-full max-w-md gap-3">
        <div className="flex items-center justify-between w-full gap-3">
          {isDesignV2 ? (
            <>
              <DesignButton
                type="button"
                variant="secondary"
                onClick={onBack}
                disabled={isSaving}
                leftIcon={<ArrowLeft className="size-4" />}
                className="w-1/3"
              >
                Zurück
              </DesignButton>
              <DesignButton
                type="button"
                variant="primary"
                onClick={onContinue}
                loading={isSaving}
                rightIcon={<ArrowRight className="size-4" />}
                className="w-2/3"
              >
                Abschließen
              </DesignButton>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onBack}
                disabled={isSaving}
                className="w-1/3 gap-1.5"
              >
                <ArrowLeft className="size-4" />
                Zurück
              </Button>
              <Button
                type="button"
                onClick={onContinue}
                disabled={isSaving}
                className="w-2/3 gap-2 shadow-sm font-medium"
              >
                Abschließen
                <ArrowRight className="size-4" />
              </Button>
            </>
          )}
        </div>

        {onSkip && (
          isDesignV2 ? (
            <DesignButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSkip}
            >
              Jetzt überspringen &amp; später verbinden
            </DesignButton>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Jetzt überspringen &amp; später verbinden
            </Button>
          )
        )}
      </div>
    </div>
  );
}

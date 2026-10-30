/**
 * Handy-Kopplung — QR-Karte (Lane A34).
 *
 * Zeigt den Einmal-Code, den Ablauf und die beiden Wege ihn zu teilen:
 * QR scannen oder Link kopieren. Das Token steckt im Fragment der URL und
 * wird weder gespeichert noch geloggt.
 */

import {
  IconCheck,
  IconCopy,
  IconDeviceMobile,
  IconLoader2,
  IconRefresh,
  IconShieldLock,
  IconShieldOff,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCountdown, formatTime } from "./format";
import type { PhoneT3Pairing } from "./types";

export type PhoneT3PairingCardProps = {
  pairing: PhoneT3Pairing | null;
  secondsLeft: number;
  secure: boolean;
  busy: boolean;
  loading: boolean;
  error: string | null;
  onNewCode: () => void;
  className?: string;
};

export function PhoneT3PairingCard({
  pairing,
  secondsLeft,
  secure,
  busy,
  loading,
  error,
  onNewCode,
  className,
}: PhoneT3PairingCardProps) {
  const [copied, setCopied] = useState(false);
  const expired = pairing !== null && secondsLeft <= 0;

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copyLink = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.pairUrl);
      setCopied(true);
    } catch {
      // Clipboard kann im Browser verweigert werden — der QR-Code bleibt.
    }
  };

  return (
    <section
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center",
        className,
      )}
    >
      <div className="flex w-full items-center justify-center gap-2">
        <IconDeviceMobile className="size-4 text-sky-500" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">Einmal-Code</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            secure
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          )}
        >
          {secure ? (
            <IconShieldLock className="size-3" aria-hidden="true" />
          ) : (
            <IconShieldOff className="size-3" aria-hidden="true" />
          )}
          {secure ? "Sicher" : "Nicht sicher"}
        </span>
      </div>

      <div className="flex size-64 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 [&_svg]:size-full">
        {!secure ? (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-zinc-600">
            <IconShieldOff className="size-8" aria-hidden="true" />
            <p className="text-xs leading-relaxed">
              Kopplung nur über HTTPS oder direkt an diesem PC. Bitte die
              sichere Adresse öffnen.
            </p>
          </div>
        ) : pairing && !expired ? (
          // SVG kommt vom eigenen Connect-Server (qrcode-generator), keine Fremddaten.
          // Als data:-Bild statt dangerouslySetInnerHTML: SVG in <img> führt kein
          // Skript aus und der Lint-Schutz bleibt intakt.
          <img
            alt="QR-Code zum Koppeln des Handys"
            className="size-full"
            height={256}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairing.qrSvg)}`}
            width={256}
          />
        ) : loading || busy ? (
          <div className="flex flex-col items-center gap-2 text-zinc-600">
            <IconLoader2 className="size-7 animate-spin" aria-hidden="true" />
            <p className="text-xs">{busy ? "Code wird erzeugt …" : "Lade …"}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-zinc-600">
            <IconDeviceMobile className="size-8" aria-hidden="true" />
            <p className="text-xs leading-relaxed">
              {expired
                ? "Der Code ist abgelaufen."
                : (error ?? "Noch kein Code erzeugt.")}
            </p>
            <Button
              onClick={onNewCode}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconRefresh className="size-3.5" aria-hidden="true" />
              Neuen Code
            </Button>
          </div>
        )}
      </div>

      {pairing && !expired ? (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            Gültig bis {formatTime(pairing.expiresAt)} Uhr · noch{" "}
            <span className="font-medium text-foreground">
              {formatCountdown(secondsLeft)}
            </span>
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              disabled={busy}
              onClick={onNewCode}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconRefresh className="size-3.5" aria-hidden="true" />
              Neuer Code
            </Button>
            <Button
              onClick={() => void copyLink()}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? (
                <IconCheck className="size-3.5" aria-hidden="true" />
              ) : (
                <IconCopy className="size-3.5" aria-hidden="true" />
              )}
              {copied ? "Link kopiert" : "Link kopieren"}
            </Button>
          </div>

          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            Genau ein Gerät, einmal verwendbar. Der Code enthält ein
            Einmal-Token und wird nicht protokolliert. Nur an eigene Geräte
            weitergeben.
          </p>
        </>
      ) : null}

      {error && secure && !pairing ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

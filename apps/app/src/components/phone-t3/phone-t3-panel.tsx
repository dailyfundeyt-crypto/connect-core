/**
 * Handy-Kopplung — Panel im Connect-Look (Lane A34).
 *
 * Einstieg laut Idee I8: „Handy verbinden“ im Benutzer-Menü. A39 hängt dieses
 * Panel dort ein (Dialog oder Einstellungsseite); es bringt kein eigenes Layout
 * mit und übernimmt Farben, Rundungen und Abstände der bestehenden Panels.
 *
 * Feature-Flag `connect.t3.bridge` (A01): aus → nichts gerendert (altes Verhalten).
 * `forceEnabled` dient nur der Vorschau/Storybook und Testzwecken.
 */

import {
  IconDeviceMobile,
  IconLoader2,
  IconRefresh,
  IconShieldLock,
  IconShieldOff,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { getT3Flag } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";
import { formatWhen } from "./format";
import { PhoneT3PairingCard } from "./phone-t3-pairing-card";
import { usePhoneT3 } from "./use-phone-t3";

export type PhoneT3PanelProps = {
  className?: string;
  /** Nur für Vorschau/Tests: Flag-Prüfung übergehen. */
  forceEnabled?: boolean;
  /** Poll-Intervall der Geräteliste (Default 5000 ms). */
  pollMs?: number;
};

export function PhoneT3Panel({
  className,
  forceEnabled,
  pollMs,
}: PhoneT3PanelProps) {
  const enabled = forceEnabled ?? getT3Flag("bridge");
  const {
    status,
    pairing,
    secondsLeft,
    loading,
    busy,
    error,
    refresh,
    newCode,
    revoke,
    dismissError,
  } = usePhoneT3({ enabled, pollMs });

  if (!enabled) return null;

  const devices = status?.devices ?? [];
  const secure = status?.secure ?? false;

  const remove = (deviceId: string, label: string) => {
    if (
      !window.confirm(
        `„${label}“ abmelden? Das Gerät muss danach neu gekoppelt werden.`,
      )
    ) {
      return;
    }
    void revoke(deviceId);
  };

  return (
    <div className={cn("space-y-6", className)}>
      <header className="flex flex-wrap items-center gap-2">
        <IconDeviceMobile className="size-5 text-sky-500" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">
          Handy verbinden
        </h2>
        <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
          T3
        </span>
      </header>

      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Scanne den QR-Code mit der Handy-Kamera. Das Handy öffnet Connect und
        steuert dieselben Agenten wie dieser PC – gleicher Stand, kein Abgleich.
        Die Verbindung bleibt auf diesem Rechner; es wird nichts veröffentlicht.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs">
        <span
          className={cn(
            "inline-flex size-2 rounded-full",
            secure ? "bg-emerald-500" : "bg-amber-500",
          )}
          aria-hidden="true"
        />
        <span className="font-medium text-foreground">
          {status
            ? secure
              ? "Sichere Verbindung"
              : "Keine sichere Verbindung"
            : "Verbindung wird geprüft …"}
        </span>
        {status?.baseUrl ? (
          <code className="max-w-full truncate rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {status.baseUrl}
          </code>
        ) : null}
        <Button
          aria-label="Status neu laden"
          className="ml-auto"
          disabled={loading}
          onClick={() => void refresh()}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {loading ? (
            <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <IconRefresh className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>

      {status?.message ? (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          <IconShieldOff
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          {status.message}
        </p>
      ) : null}

      <PhoneT3PairingCard
        busy={busy}
        error={error}
        loading={loading}
        onNewCode={() => {
          dismissError();
          void newCode();
        }}
        pairing={pairing}
        secondsLeft={secondsLeft}
        secure={secure}
      />

      <section className="rounded-2xl border border-border">
        <div className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            Gekoppelte Geräte ({devices.length})
          </span>
          <Button
            className="ml-auto"
            disabled={loading}
            onClick={() => void refresh()}
            size="sm"
            type="button"
            variant="ghost"
          >
            Aktualisieren
          </Button>
        </div>

        {devices.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Noch kein Handy gekoppelt.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {devices.map((device) => (
              <li className="flex items-center gap-3 px-4 py-3" key={device.id}>
                <IconDeviceMobile
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">
                    {device.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    gekoppelt {formatWhen(device.createdAt)} · zuletzt aktiv{" "}
                    {formatWhen(device.lastSeenAt)}
                  </div>
                </div>
                <Button
                  aria-label={`${device.label} abmelden`}
                  onClick={() => remove(device.id, device.label)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <IconTrash className="size-3.5" aria-hidden="true" />
                  Abmelden
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <IconShieldLock
          className="mt-0.5 size-3.5 shrink-0"
          aria-hidden="true"
        />
        Der Code gilt fünf Minuten und genau einmal. Er enthält ein
        Einmal-Token, das nicht protokolliert wird. Abmelden widerruft den
        Zugang sofort; Daten werden dabei nicht gelöscht.
      </p>

      {error && pairing ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

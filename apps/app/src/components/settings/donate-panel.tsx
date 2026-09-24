import { IconHeartHandshake, IconLoader2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  activateBlueCheck,
  getBlueCheck,
  getDonateUrl,
  openDonateCheckout,
  setDonateUrl,
  subscribeBlueCheck,
} from "@/lib/donations/blue-check";

/**
 * Settings → bottom: spend via Stripe → earn Blue Check (+20% Marketplace).
 */
export function DonatePanel() {
  const [state, setState] = useState(() => getBlueCheck());
  const [url, setUrl] = useState(() => getDonateUrl());
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeBlueCheck(() => setState(getBlueCheck())), []);

  return (
    <div className="space-y-3 rounded-2xl border border-sky-500/30 bg-sky-500/[0.04] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full bg-sky-500 text-white">
          <IconHeartHandshake className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Spenden machen</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Spende an Connect (Stripe o. Ä.) → blauer Haken am Profil. Zeigt:
            Mensch & Supporter. Im Marketplace +20 % Sichtbarkeit.
          </p>
        </div>
        {state.active ? (
          <span className="shrink-0 rounded-full bg-sky-500 px-2.5 py-1 text-[11px] font-bold text-white">
            ✓ Aktiv
          </span>
        ) : null}
      </div>

      {!state.active ? (
        <>
          <Input
            aria-label="Stripe Donate URL"
            className="h-9 font-mono text-xs"
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setDonateUrl(url)}
            placeholder="https://buy.stripe.com/…"
            value={url}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                setDonateUrl(url);
                openDonateCheckout();
              }}
              size="sm"
              type="button"
            >
              Mit Stripe spenden
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                activateBlueCheck({ amountLabel: "Spende", provider: "stripe" });
                setBusy(false);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {busy ? <IconLoader2 className="size-4 animate-spin" /> : null}
              Spende bestätigt — Haken aktivieren
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Blauer Haken seit{" "}
          {state.donatedAt
            ? new Date(state.donatedAt).toLocaleDateString()
            : "—"}
          {state.amountLabel ? ` · ${state.amountLabel}` : ""}. Danke — dein
          Profil wird im Marketplace stärker gepusht.
        </p>
      )}
    </div>
  );
}

import { IconKey, IconLoader2, IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  redeemCode,
  subscribeMarketplace,
} from "@/lib/marketplace/store";

/**
 * After a purchase on the seller’s own page (Swipe / Formular), the buyer
 * pastes the access code here. Connect never takes payment.
 */
export function RedeemCodeBar({ onRedeemed }: { onRedeemed?: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeMarketplace(() => undefined), []);

  return (
    <form
      className="rounded-2xl border border-border bg-muted/30 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
          const asset = redeemCode(code);
          setMessage(
            `Freigeschaltet: ${asset.title} · Serial ${asset.serial}. Unter „Meine Bots“ / Besitz.`,
          );
          setCode("");
          onRedeemed?.();
        } catch (caught) {
          setError(
            caught instanceof Error ? caught.message : "Einlösen fehlgeschlagen.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <IconKey className="size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm font-semibold">Zugangscode nach Kauf</p>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
        Connect ist der Marketplace zum Finden — Affiliate-Traffic. Kaufen /
        Swipen passiert auf der Seite des Anbieters. Hier nur den Code einlösen,
        den du nach dem Kauf bekommst.
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          aria-label="Zugangscode"
          className="h-9 font-mono text-xs uppercase"
          onChange={(e) => setCode(e.target.value)}
          placeholder="CB-XXXX-XXXX"
          value={code}
        />
        <Button disabled={busy || !code.trim()} size="sm" type="submit">
          {busy ? <IconLoader2 className="size-4 animate-spin" /> : null}
          Freischalten
        </Button>
      </div>
      {message ? (
        <p className="mt-2 text-xs text-emerald-700" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function MarketplaceSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="Bots und Unternehmen suchen"
        className="h-10 rounded-xl pl-9"
        onChange={(e) => onChange(e.target.value)}
        placeholder="Suchen nach Name, Serial, $TICKER…"
        value={value}
      />
    </div>
  );
}

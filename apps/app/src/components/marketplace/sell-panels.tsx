import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentProfile } from "@/lib/agents/queries";
import { getCompany, listCompanies } from "@/lib/companies/store";
import { rememberQuoteUrl } from "@/lib/marketplace/live-prices";
import { publishListing, type ListingOffer } from "@/lib/marketplace/store";

/**
 * Publish a company into the discovery catalog.
 * Connect only lists + shows live Mirks prices; checkout is on sellerUrl
 * (Swipe / Formular on the seller’s own site) — affiliate model.
 */
export function SellCompanyPanel({
  onPublished,
  lockedCompanyId,
}: {
  onPublished: () => void;
  lockedCompanyId?: string;
}) {
  const companies = listCompanies();
  const [companyId, setCompanyId] = useState(
    lockedCompanyId ?? companies[0]?.id ?? "",
  );
  const [offer, setOffer] = useState<ListingOffer>("sale");
  const [price, setPrice] = useState("€5.000");
  const [sellerUrl, setSellerUrl] = useState("https://");
  const [ticker, setTicker] = useState("");
  const [memecoinUrl, setMemecoinUrl] = useState("https://pump.fun");
  const [codeOut, setCodeOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeId = lockedCompanyId ?? companyId;

  return (
    <form
      className="space-y-2 rounded-2xl border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setCodeOut(null);
        const company = getCompany(activeId);
        if (!company) {
          setError("Unternehmen wählen.");
          return;
        }
        if (!sellerUrl.trim() || sellerUrl === "https://") {
          setError("Link zu deiner Verkaufsseite (Swipe / Formular) nötig.");
          return;
        }
        try {
          const tickerClean = ticker.trim();
          const label = tickerClean
            ? tickerClean.startsWith("$")
              ? tickerClean
              : `$${tickerClean}`
            : undefined;
          if (label) rememberQuoteUrl(label, memecoinUrl.trim() || "https://pump.fun");
          const { listing, code } = publishListing({
            kind: "company",
            targetId: company.id,
            title: `Unternehmen · ${company.name}`,
            description: `${company.description} — ${
              offer === "rent" ? "zur Miete" : "zum Kauf"
            } auf der Anbieter-Seite (Swipe/Formular). Hier nur finden & Kurs mitlesen.`,
            offer,
            priceLabel: price.trim() || "Preis auf der Anbieter-Seite",
            sellerUrl: sellerUrl.trim(),
            sellerName: "Du",
            companyId: company.id,
            ...(label
              ? {
                  memecoinTicker: label,
                  memecoinUrl: memecoinUrl.trim() || "https://pump.fun",
                }
              : {}),
          });
          setCodeOut(
            `Katalog ${listing.serial} live. Zugangscode für Käufer nach deren Kauf: ${code}`,
          );
          onPublished();
        } catch (caught) {
          setError(
            caught instanceof Error ? caught.message : "Eintragen fehlgeschlagen.",
          );
        }
      }}
    >
      <p className="text-sm font-semibold">Unternehmen in den Katalog</p>
      <p className="text-[12px] text-muted-foreground">
        Affiliate-Modell: Connect bringt Interessenten. Verkauf per Swipe oder
        Formular nur auf deiner Domain. Optional Mirks-Ticker — bei uns nur
        Live-Kurs, Handel auf Pump.fun / Solana.
      </p>
      {lockedCompanyId ? null : (
        <select
          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
          onChange={(e) => setCompanyId(e.target.value)}
          value={companyId}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        {(
          [
            ["sale", "Kauf"],
            ["rent", "Miete"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={
              offer === id
                ? "rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background"
                : "rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground"
            }
            key={id}
            onClick={() => setOffer(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Preis-Hinweis (Anzeige)"
          value={price}
        />
        <Input
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Mirks $TICKER (optional)"
          value={ticker}
        />
      </div>
      {ticker.trim() ? (
        <Input
          onChange={(e) => setMemecoinUrl(e.target.value)}
          placeholder="https://pump.fun/coin/… (nur Kurs-Link)"
          value={memecoinUrl}
        />
      ) : null}
      <Input
        onChange={(e) => setSellerUrl(e.target.value)}
        placeholder="https://deine-seite.com/swipe-oder-formular"
        value={sellerUrl}
      />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {codeOut ? (
        <p
          className="rounded-lg bg-emerald-50 px-2 py-1.5 font-mono text-xs text-emerald-800"
          role="status"
        >
          {codeOut}
        </p>
      ) : null}
      <Button size="sm" type="submit">
        In Marketplace listen
      </Button>
    </form>
  );
}

/** List a bot for discovery — sale happens on the seller’s swipe page. */
export function SellBotPanel({
  agents,
  onPublished,
}: {
  agents: AgentProfile[];
  onPublished: () => void;
}) {
  const mine = useMemo(() => agents.filter((a) => a.mine), [agents]);
  const [agentId, setAgentId] = useState(mine[0]?.id ?? "");
  const [offer, setOffer] = useState<ListingOffer>("rent");
  const [price, setPrice] = useState("€49 / Woche");
  const [sellerUrl, setSellerUrl] = useState("https://");
  const [codeOut, setCodeOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (mine.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
        Keine eigenen Bots — erst Agent erstellen, dann hier für Kunden
        auffindbar machen.
      </p>
    );
  }

  return (
    <form
      className="space-y-2 rounded-2xl border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setCodeOut(null);
        const agent = mine.find((a) => a.id === agentId);
        if (!agent) {
          setError("Bot wählen.");
          return;
        }
        if (!sellerUrl.trim() || sellerUrl === "https://") {
          setError("Link zu deiner Swipe-/Verkaufsseite nötig.");
          return;
        }
        try {
          const { listing, code } = publishListing({
            kind: "bot",
            targetId: agent.id,
            title: agent.name,
            description: `${agent.name} — ${
              offer === "rent" ? "Miete" : "Kauf"
            } per Swipe auf der Anbieter-Seite. Connect leitet nur weiter.`,
            offer,
            priceLabel: price.trim() || "Preis auf der Anbieter-Seite",
            sellerUrl: sellerUrl.trim(),
            sellerName: "Du",
          });
          setCodeOut(
            `Katalog ${listing.serial} live. Zugangscode für Käufer: ${code}`,
          );
          onPublished();
        } catch (caught) {
          setError(
            caught instanceof Error ? caught.message : "Eintragen fehlgeschlagen.",
          );
        }
      }}
    >
      <p className="text-sm font-semibold">Bot auffindbar machen</p>
      <p className="text-[12px] text-muted-foreground">
        Kunden suchen hier. Verkauf per Swipe auf deiner Seite — wir sind der
        Affiliate-Kanal, nicht die Kasse.
      </p>
      <select
        className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
        onChange={(e) => setAgentId(e.target.value)}
        value={agentId}
      >
        {mine.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        {(
          [
            ["sale", "Kauf"],
            ["rent", "Miete"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={
              offer === id
                ? "rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background"
                : "rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground"
            }
            key={id}
            onClick={() => setOffer(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <Input
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Preis-Hinweis (Anzeige)"
        value={price}
      />
      <Input
        onChange={(e) => setSellerUrl(e.target.value)}
        placeholder="https://deine-seite.com/bots-swipe"
        value={sellerUrl}
      />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {codeOut ? (
        <p
          className="rounded-lg bg-emerald-50 px-2 py-1.5 font-mono text-xs text-emerald-800"
          role="status"
        >
          {codeOut}
        </p>
      ) : null}
      <Button size="sm" type="submit">
        In Marketplace listen
      </Button>
    </form>
  );
}

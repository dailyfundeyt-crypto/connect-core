import { IconExternalLink } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { LivePriceChip } from "@/components/marketplace/live-price-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCompany } from "@/lib/companies/store";
import { useLocale } from "@/lib/i18n/use-locale";
import {
  listListings,
  publishListing,
  subscribeMarketplace,
  type MarketplaceListing,
} from "@/lib/marketplace/store";

/**
 * Sell company and/or list employees → redirect to seller page.
 */
export function CompanyMarketplaceStrip({ companyId }: { companyId: string }) {
  const { t } = useLocale();
  const [tick, setTick] = useState(0);
  const [sellerUrl, setSellerUrl] = useState("");
  const [price, setPrice] = useState("€5.000");
  const [employeeIds, setEmployeeIds] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeMarketplace(() => setTick((n) => n + 1)), []);

  const companyListing = useMemo(() => {
    void tick;
    return listListings().find(
      (l) => l.kind === "company" && l.targetId === companyId,
    ) as MarketplaceListing | undefined;
  }, [companyId, tick]);

  const company = getCompany(companyId);
  const roster = company?.agentIds ?? [];

  const redirectToSeller = (url: string) => {
    const href = url.trim();
    if (!href || href === "https://") return;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const publish = (kind: "company" | "bot", targetId: string, title: string) => {
    setError(null);
    const url = sellerUrl.trim();
    if (!url || url === "https://") {
      setError("Verkaufslink nötig.");
      return;
    }
    try {
      publishListing({
        kind,
        targetId,
        title,
        description:
          kind === "company"
            ? (company?.description ?? title)
            : `Mitarbeiter · ${title}`,
        offer: "sale",
        priceLabel: price.trim() || "Preis auf Anfrage",
        sellerUrl: url,
        sellerName: "Du",
        companyId,
      });
      setTick((n) => n + 1);
      redirectToSeller(url);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Listen fehlgeschlagen.",
      );
    }
  };

  if (companyListing) {
    return (
      <section className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border px-3 py-2.5">
        <span className="text-sm font-bold">{companyListing.priceLabel}</span>
        {companyListing.memecoinTicker ? (
          <LivePriceChip
            marketUrl={companyListing.memecoinUrl}
            ticker={companyListing.memecoinTicker}
          />
        ) : null}
        <Button
          className="ml-auto gap-1"
          onClick={() => redirectToSeller(companyListing.sellerUrl)}
          size="sm"
          type="button"
        >
          {t("company.buy")}
          <IconExternalLink className="size-3.5" />
        </Button>
      </section>
    );
  }

  return (
    <form
      className="mt-4 space-y-2 rounded-2xl border border-border px-3 py-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!company) {
          setError("Unternehmen fehlt.");
          return;
        }
        publish("company", company.id, company.name);
        const extras = employeeIds
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const id of extras) {
          if (roster.includes(id)) {
            publish("bot", id, id);
          }
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-[7.5rem]"
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Preis"
          value={price}
        />
        <Input
          className="h-8 min-w-[12rem] flex-1"
          onChange={(e) => setSellerUrl(e.target.value)}
          placeholder="https://… Verkaufsseite"
          value={sellerUrl}
        />
        <Button size="sm" type="submit">
          {t("company.sell")}
        </Button>
      </div>
      {roster.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 min-w-[12rem] flex-1 font-mono text-xs"
            onChange={(e) => setEmployeeIds(e.target.value)}
            placeholder={`Mitarbeiter-IDs (z. B. ${roster.slice(0, 2).join(", ")})`}
            value={employeeIds}
          />
          <span className="text-[11px] text-muted-foreground">
            {t("employees.sell")}
          </span>
        </div>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

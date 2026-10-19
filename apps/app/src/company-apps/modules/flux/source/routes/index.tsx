import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileUp,
  Maximize2,
  PackageCheck,
  Plus,
  QrCode,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@flux/components/ui/button";
import { Input } from "@flux/components/ui/input";
import { SettingsPanel } from "@flux/components/settings/settings-panel";
import { AuthScreen } from "@flux/components/auth/auth-screen";
import { useAuth } from "@flux/lib/supabase/auth";
import {
  loadSnapshot,
  saveSnapshot,
  type DeliveryRow,
  type Purchase,
  type PurchaseBatch,
  type PurchaseItem,
  type PurchaseLine,
  type RevenueLine,
  type Sale,
  type ShippingLine,
  type Store,
} from "@flux/lib/supabase/snapshot";
import type { SyncStatus } from "@flux/lib/supabase/types";
import { AnkaufDashboard } from "@flux/components/purchase/ankauf-dashboard";
import { VerkaufDashboard } from "@flux/components/sale/verkauf-dashboard";
import { LieferungDashboard } from "@flux/components/sale/lieferung-dashboard";
import { UmsatzDashboard } from "@flux/components/umsatz/umsatz-dashboard";
import { LandingPage } from "@flux/components/landing/landing-page";
import logoAsset from "@flux/assets/flux-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flux — Warenhandel im Fluss" },
      { name: "description", content: "Ankauf, Verkauf, Lieferungen und Umsatz zentral verwalten." },
      { property: "og:title", content: "Flux — Warenhandel im Fluss" },
      { property: "og:description", content: "Ankauf, Verkauf, Lieferungen und Umsatz zentral verwalten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const sections = ["Ankauf", "Verkauf", "Lieferung", "Umsatz"] as const;
type Section = (typeof sections)[number];
type Entry = { name: string; detail: string; amount: string; time: string };

function Index() {
  const auth = useAuth();
  const [active, setActive] = useState(0);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [revenue, setRevenue] = useState<RevenueLine[]>([]);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([]);
  const [shippingLines, setShippingLines] = useState<ShippingLine[]>([]);
  const [purchaseBatches, setPurchaseBatches] = useState<PurchaseBatch[]>([]);
  const [deliveryRows, setDeliveryRows] = useState<DeliveryRow[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "idle" });
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const prevUserId = useRef<string | null>(null);

  // Hydrate from Supabase whenever a user signs in (per-user scope)
  useEffect(() => {
    if (!auth.client || auth.status.kind !== "signed_in") {
      setHydrated(false);
      return;
    }
    const userId = auth.status.user.id;
    if (prevUserId.current === userId) return;
    prevUserId.current = userId;
    setHydrated(false);
    setSyncStatus({ kind: "loading" });
    void (async () => {
      try {
        const snapshot = await loadSnapshot(auth.client!, userId);
        setPurchases(snapshot.purchases);
        setPurchaseItems(snapshot.purchaseItems);
        setStores(snapshot.stores);
        setSales(snapshot.sales);
        setRevenue(snapshot.revenueLines);
        setPurchaseLines(snapshot.purchaseLines);
        setShippingLines(snapshot.shippingLines);
        setPurchaseBatches(snapshot.purchaseBatches);
        setDeliveryRows(snapshot.deliveryRows);
        setSyncStatus({ kind: "ready", at: Date.now() });
      } catch (err) {
        setSyncStatus({ kind: "error", message: err instanceof Error ? err.message : "Unbekannter Fehler" });
      } finally {
        setHydrated(true);
      }
    })();
  }, [auth.client, auth.status]);

  // Sign-out: reset to empty so local UI doesn't bleed across users
  useEffect(() => {
    if (auth.status.kind === "signed_out") {
      setPurchases([]);
      setPurchaseItems([]);
      setStores([]);
      setSales([]);
      setRevenue([]);
      setPurchaseLines([]);
      setShippingLines([]);
      setPurchaseBatches([]);
      setDeliveryRows([]);
      setHydrated(false);
      prevUserId.current = null;
      setSyncStatus({ kind: "idle" });
      setLastSavedAt(null);
    }
  }, [auth.status]);

  // Auto-sync on any state change after hydration
  useEffect(() => {
    if (!auth.client || auth.status.kind !== "signed_in") return;
    if (!hydrated) return;
    const userId = auth.status.user.id;
    setSyncStatus({ kind: "loading" });
    const timer = window.setTimeout(() => {
      void saveSnapshot(auth.client!, userId, {
        purchases,
        purchaseItems,
        purchaseImages: [],
        stores,
        affiliateLinks: [],
        sales,
        purchaseLines,
        shippingLines,
        revenueLines: revenue,
        purchaseBatches,
        deliveryRows,
      })
        .then(() => {
          const at = Date.now();
          setLastSavedAt(at);
          setSyncStatus({ kind: "ready", at });
        })
        .catch((err: unknown) => {
          setSyncStatus({ kind: "error", message: err instanceof Error ? err.message : "Unbekannter Fehler" });
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [purchases, purchaseItems, sales, purchaseLines, shippingLines, revenue, purchaseBatches, deliveryRows, auth.client, auth.status, hydrated]);

  // Keep hooks above this conditional: auth may move from loading to signed in
  // after mount, and changing the number of hooks would break the Flux route.
  if (auth.status.kind !== "signed_in") {
    return <LandingPage />;
  }

  const goTo = (index: number) => {
    setActive(index);
    scroller.current?.children[index]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next >= 0 && next < sections.length) setActive(next);
  };

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const formatTotalRevenue = (rows: Sale[]) => {
    const total = rows.reduce((sum, s) => {
      const n = Number(s.amount.replace(/[^\d,]/g, "").replace(",", "."));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return total.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  };

  const formatAverageSale = (rows: Sale[]) => {
    if (rows.length === 0) return "0,00 €";
    const total = rows.reduce((sum, s) => {
      const n = Number(s.amount.replace(/[^\d,]/g, "").replace(",", "."));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return (total / rows.length).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-8 sm:pt-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <img src={logoAsset.url} alt="Flux" className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-sm" />
              <div className="min-w-0">
                <p className="truncate text-xl font-bold">Flux</p>
                <p className="truncate text-xs text-muted-foreground">Logistik ohne Interface</p>
              </div>
            </div>
          </div>
          <nav aria-label="Bereiche" className="relative mt-5 grid grid-cols-4">
            <div
              className="absolute bottom-0 h-0.5 w-1/4 bg-primary transition-transform duration-300"
              style={{ transform: `translateX(${active * 100}%)` }}
            />
            {sections.map((section, index) => (
              <Button
                key={section}
                type="button"
                variant="ghost"
                onClick={() => goTo(index)}
                className={`h-11 rounded-none px-1 text-xs shadow-none sm:text-sm ${active === index ? "text-foreground" : "text-muted-foreground"}`}
                aria-current={active === index ? "page" : undefined}
              >
                {section}
              </Button>
            ))}
          </nav>
        </div>
      </header>

      {notice && (
        <div className="fixed right-4 top-24 z-40 flex items-center gap-2 rounded-md bg-success px-4 py-3 text-sm font-medium text-success-foreground shadow-lg">
          <Check className="h-4 w-4" /> {notice}
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onOpen={() => setSettingsOpen(true)}
        onClose={() => setSettingsOpen(false)}
        status={syncStatus}
        lastSavedAt={lastSavedAt}
        stores={stores}
        onStoresChange={setStores}
      />

      <div ref={scroller} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Page title="Ankauf" kicker="Beschaffung" subtitle="Einkäufe mit allen Items, Bildern, KI-Beschreibungen und Profit-Tracking.">
          <AnkaufDashboard
            purchases={purchases}
            items={purchaseItems}
            stores={stores}
            onPurchaseChange={setPurchases}
            onItemChange={setPurchaseItems}
            onSold={(item, salePrice, customerName) => {
              const now = new Date();
              const dateLabel = now.toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
              const sale: Sale = {
                id: Date.now(),
                customerName: customerName || "Unbenannt",
                description: `${item.title || "Item"} · ${item.uniqueCode}`,
                amount: `${salePrice.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
                time: dateLabel,
                status: "open",
              };
              setSales([sale, ...sales]);
              setPurchaseItems(
                purchaseItems.map((it) =>
                  it.id === item.id
                    ? {
                        ...it,
                        status: "sold",
                        soldAt: now.toISOString(),
                        salePrice,
                        saleOrderId: sale.id,
                      }
                    : it,
                ),
              );
              flash(`Verkauft: ${item.uniqueCode} · ${sale.amount}`);
            }}
          />
        </Page>

        <Page title="Verkauf" kicker="Aufträge" subtitle="Verkauf von Artikeln – mit Zuordnung pro Ankauf, Payoff-Graph und Store.">
          <VerkaufDashboard
            items={purchaseItems}
            purchases={purchases}
            stores={stores}
            sales={sales}
            onItemChange={setPurchaseItems}
            onStoresChange={setStores}
          />
        </Page>

        <section className="w-full shrink-0 snap-start bg-white px-4 py-8 text-neutral-900 sm:px-8 sm:py-12">
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-semibold uppercase text-neutral-400">Logistik</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Lieferung</h1>
            <p className="mt-2 text-sm text-neutral-500">Kartons, QR-Codes und Rechnungen in einer Notion-Style Tabelle.</p>
            <div className="mt-8">
              <LieferungDashboard rows={deliveryRows} items={purchaseItems} onRowsChange={setDeliveryRows} />
            </div>
          </div>
        </section>

        <section className="w-full shrink-0 snap-start bg-white px-4 py-8 text-neutral-900 sm:px-8 sm:py-12">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-semibold uppercase text-neutral-400">Finanzen</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Umsatz</h1>
            <p className="mt-2 text-sm text-neutral-500">Ankäufe, Versand, Erlöse, Payoff pro Einkauf, Listing-Empfehlung pro Item und Store-Verteilung.</p>
            <div className="mt-8">
              <UmsatzDashboard purchases={purchases} items={purchaseItems} stores={stores} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Page({ title, kicker, subtitle, children }: { title: Section; kicker: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="w-full shrink-0 snap-start px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase text-primary">{kicker}</p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">Zum Wechseln wischen</span>
        </div>
        <div className="mt-8 space-y-5">{children}</div>
      </div>
    </section>
  );
}

function MetricGrid({ items }: { items: [string, string, string, ReactNode][] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map(([label, value, sub, icon]) => (
        <article key={label} className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">{label}</span><span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span></div>
          <p className="mt-3 text-2xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </article>
      ))}
    </div>
  );
}

function ContentGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.35fr)]">{children}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium">{label}{children}</label>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-5">{children}</div></div>;
}

function TradeForm({ mode, onAdd }: { mode: "Ankauf" | "Verkauf"; onAdd: (entry: Entry) => void }) {
  const party = mode === "Ankauf" ? "Lieferant" : "Kunde";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const quantity = Number(data.get("quantity")) || 1;
    const price = Number(data.get("price")) || 0;
    onAdd({ name: String(data.get("party")), detail: `${quantity} × ${data.get("item")}`, amount: `${(quantity * price).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`, time: "Gerade eben" });
    event.currentTarget.reset();
  };
  return (
    <Panel title={`${mode} erfassen`}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label={party}><Input name="party" placeholder={`${party} auswählen`} required /></Field>
        <Field label="Artikel"><Input name="item" placeholder="Artikelbezeichnung" required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Menge"><Input name="quantity" type="number" min="1" placeholder="1" required /></Field>
          <Field label={mode === "Ankauf" ? "Einkaufspreis" : "Verkaufspreis"}><Input name="price" type="number" min="0" step="0.01" placeholder="0,00 €" required /></Field>
        </div>
        <Button className="mt-1 h-11 w-full"><Plus /> {mode} hinzufügen</Button>
      </form>
    </Panel>
  );
}

type DeliveryFile = { dataUrl: string; name: string; kind: "image" | "pdf" };

function readFile(file: File): Promise<DeliveryFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () =>
      resolve({
        dataUrl: String(reader.result),
        name: file.name,
        kind: file.type === "application/pdf" ? "pdf" : "image",
      });
    reader.readAsDataURL(file);
  });
}


import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CircleDollarSign,
  ExternalLink,
  Filter,
  PackageCheck,
  Search,
  Sparkles,
} from "lucide-react";
import { Input } from "@flux/components/ui/input";
import type { Purchase, PurchaseItem, Sale, Store } from "@flux/lib/supabase/snapshot";
import { platformLabel } from "@flux/lib/mcp/client";

const eur = (v: number) =>
  v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

type VerkaufDashboardProps = {
  items: PurchaseItem[];
  purchases: Purchase[];
  stores: Store[];
  sales: Sale[];
  onItemChange: (next: PurchaseItem[]) => void;
  onStoresChange: (next: Store[]) => void;
};

export function VerkaufDashboard({ items, purchases, stores, sales, onItemChange, onStoresChange }: VerkaufDashboardProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseItem["status"]>("all");

  // Map id → display values
  const purchaseById = useMemo(() => new Map(purchases.map((p) => [p.id, p])), [purchases]);
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  // Aggregated metrics
  const metrics = useMemo(() => {
    const sold = items.filter((i) => i.status === "sold");
    const revenue = sold.reduce((s, i) => s + (i.salePrice ?? 0), 0);
    const openListings = items.filter((i) => i.status === "listed" || i.status === "reserved");
    const suggestedRevenue = openListings.reduce((s, i) => s + (i.suggestedPrice ?? i.pricePaid * 2), 0);
    return {
      totalSold: sold.length,
      revenue,
      openListings: openListings.length,
      avgSalePrice: sold.length > 0 ? revenue / sold.length : 0,
      suggestedRevenue,
    };
  }, [items]);

  // Filter rows
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items
      .filter((i) => statusFilter === "all" || i.status === statusFilter)
      .filter(
        (i) =>
          !needle ||
          i.uniqueCode.toLowerCase().includes(needle) ||
          i.title.toLowerCase().includes(needle) ||
          (purchaseById.get(i.purchaseId)?.supplierName.toLowerCase().includes(needle) ?? false) ||
          (storeById.get(i.storeId ?? -1)?.name.toLowerCase().includes(needle) ?? false),
      )
      .sort((a, b) => (a.id > b.id ? -1 : 1));
  }, [items, search, statusFilter, purchaseById, storeById]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI icon={<PackageCheck className="h-4 w-4" />} tone="emerald" label="Verkäufe" value={`${metrics.totalSold}`} sub="Items verkauft" />
        <KPI icon={<CircleDollarSign className="h-4 w-4" />} tone="emerald" label="Erlös" value={eur(metrics.revenue)} sub={`Ø ${eur(metrics.avgSalePrice)}`} />
        <KPI icon={<Sparkles className="h-4 w-4" />} tone="neutral" label="im Listing" value={`${metrics.openListings}`} sub="offen / reserviert" />
        <KPI icon={<ArrowUpRight className="h-4 w-4" />} tone="amber" label="Möglicher Erlös" value={eur(metrics.suggestedRevenue)} sub="aus offenen Listings" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suche nach Item-Code, Titel, Lieferant, Store …" className="pl-9" />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1">
          <Filter className="h-3.5 w-3.5 text-neutral-400 ml-1.5 mr-0.5" />
          {(["all", "in_stock", "listed", "reserved", "sold"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${statusFilter === s ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              {s === "all" ? "Alle" : statusLabel(s)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/50 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 w-28">Code</th>
              <th className="px-4 py-3 min-w-[160px]">Titel</th>
              <th className="px-4 py-3 w-32 text-right">Preis</th>
              <th className="px-4 py-3 w-64">Zugeordneter Ankauf · Marge</th>
              <th className="px-4 py-3 w-36">Store</th>
              <th className="px-4 py-3 w-28">Status</th>
              <th className="px-4 py-3 w-28 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-14 text-center text-sm text-neutral-400">Keine Items. Lege im Ankauf neue Items an.</td></tr>
            ) : (
              rows.map((item) => {
                const purchase = purchaseById.get(item.purchaseId);
                const store = storeById.get(item.storeId ?? -1);
                const invested = item.pricePaid + item.shippingShare;
                const soldPrice = item.salePrice ?? 0;
                const sold = item.status === "sold";
                const margin = soldPrice - invested;
                const payoffPct = purchase && purchase.totalPrice + purchase.shippingPrice > 0
                  ? Math.min(100, (soldPrice / (purchase.totalPrice + purchase.shippingPrice)) * 100)
                  : 0;
                return (
                  <tr key={item.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/40">
                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-neutral-700">{item.uniqueCode}</td>
                    <td className="px-4 py-3">
                      <p className="line-clamp-1 text-sm font-medium text-neutral-900">{item.title || "Ohne Titel"}</p>
                      {item.description && <p className="line-clamp-1 text-[11px] text-neutral-500">{item.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-semibold tabular-nums text-neutral-900">{eur(item.pricePaid)}</p>
                      <p className="text-[10px] tabular-nums text-neutral-500">+ {eur(item.shippingShare)} Versand</p>
                      {sold && (
                        <p className={`text-[10px] tabular-nums ${margin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{margin >= 0 ? "+" : ""}{eur(margin)} Marge</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-neutral-800">{purchase?.supplierName ?? "—"}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${sold && margin >= 0 ? "bg-emerald-500" : sold ? "bg-rose-500" : "bg-amber-400"}`}
                            style={{ width: `${Math.max(0, Math.min(100, payoffPct))}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-[10px] tabular-nums text-neutral-500">{payoffPct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {store ? (
                        <div className="flex items-center gap-2">
                          {store.profileImageUrl ? (
                            <img src={store.profileImageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                          ) : (
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-[10px] font-semibold text-white">{store.emoji || store.name.slice(0, 1).toUpperCase()}</span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-neutral-800">{store.name}</p>
                            <p className="truncate text-[10px] text-neutral-500">{platformLabel(store.platform)}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-neutral-400">kein Store</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.affiliateUrl ? (
                        <a href={item.affiliateUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-medium text-neutral-600 hover:bg-neutral-50">
                          <ExternalLink className="h-3 w-3" /> Preis
                        </a>
                      ) : (
                        <span className="text-[10px] text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {sales.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <header className="flex items-baseline justify-between border-b border-neutral-200 px-5 py-3">
            <h3 className="text-sm font-semibold text-neutral-900">Verkaufs-Historie</h3>
            <span className="text-[11px] text-neutral-500">{sales.length} Einträge</span>
          </header>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs font-medium uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-2">Kunde</th>
                <th className="px-4 py-2">Position</th>
                <th className="px-4 py-2 w-28 text-right">Betrag</th>
                <th className="px-4 py-2 w-28">Zeit</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2 text-sm font-medium text-neutral-800">{s.customerName}</td>
                  <td className="px-4 py-2 text-sm text-neutral-500">{s.description}</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums">{s.amount}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{s.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function statusLabel(s: PurchaseItem["status"]): string {
  switch (s) {
    case "in_stock": return "Bestand";
    case "listed": return "Listing";
    case "reserved": return "Reserviert";
    case "sold": return "Verkauft";
  }
}

function StatusPill({ status }: { status: PurchaseItem["status"] }) {
  const map: Record<PurchaseItem["status"], { label: string; cls: string }> = {
    in_stock: { label: "Bestand", cls: "bg-amber-50 text-amber-700" },
    listed: { label: "Listing", cls: "bg-blue-50 text-blue-700" },
    reserved: { label: "Reserviert", cls: "bg-violet-50 text-violet-700" },
    sold: { label: "Verkauft", cls: "bg-emerald-50 text-emerald-700" },
  };
  const s = map[status];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>{s.label}</span>;
}

function KPI({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: "neutral" | "amber" | "emerald" | "blue" }) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-50 text-neutral-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-md ${tones[tone]}`}>{icon}</span>
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-neutral-500">{sub}</p>
    </div>
  );
}

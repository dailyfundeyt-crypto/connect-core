import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Box,
  Filter,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Purchase, PurchaseItem, Store } from "@flux/lib/supabase/snapshot";
import { platformLabel } from "@flux/lib/mcp/client";

const eur = (v: number) =>
  v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

type UmsatzDashboardProps = {
  purchases: Purchase[];
  items: PurchaseItem[];
  stores: Store[];
};

const COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#f97316", "#6366f1"];

export function UmsatzDashboard({ purchases, items, stores }: UmsatzDashboardProps) {
  const [filter, setFilter] = useState<"all" | "active" | "sold" | "archived">("all");

  // Aggregates
  const aggregates = useMemo(() => {
    const totalPurchasesCost = purchases.reduce((s, p) => s + p.totalPrice, 0);
    const totalShippingCost = purchases.reduce((s, p) => s + p.shippingPrice, 0);
    const totalRevenue = items.filter((i) => i.status === "sold").reduce((s, i) => s + (i.salePrice ?? 0), 0);
    return {
      totalPurchasesCost,
      totalShippingCost,
      totalRevenue,
      profit: totalRevenue - (totalPurchasesCost + totalShippingCost),
    };
  }, [purchases, items]);

  // Per-purchase row
  const purchaseRows = useMemo(() => {
    return purchases.map((p) => {
      const purchaseItems = items.filter((i) => i.purchaseId === p.id);
      const invested = p.totalPrice + p.shippingPrice;
      const sold = purchaseItems.filter((i) => i.status === "sold");
      const revenue = sold.reduce((s, i) => s + (i.salePrice ?? 0), 0);
      const payoffPct = invested > 0 ? (revenue / invested) * 100 : 0;
      return {
        purchase: p,
        itemCount: purchaseItems.length,
        soldCount: sold.length,
        invested,
        revenue,
        payoffPct,
      };
    }).sort((a, b) => b.payoffPct - a.payoffPct);
  }, [purchases, items]);

  const filtered = useMemo(() => purchaseRows.filter((r) => filter === "all" || r.purchase.status === filter), [purchaseRows, filter]);

  // Pie chart data: revenue share per store
  const storeRevenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.status !== "sold" || !item.salePrice) continue;
      const store = stores.find((s) => s.id === item.storeId);
      const key = store?.name ?? "Ohne Store";
      map.set(key, (map.get(key) ?? 0) + item.salePrice);
    }
    return Array.from(map.entries())
      .filter(([, v]) => v > 0)
      .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
  }, [items, stores]);

  // Recommendation hint for current item distribution
  const strategyMix = useMemo(() => {
    const open = items.filter((i) => i.status !== "sold");
    const recs = { online: 0, offline: 0, bundle: 0, unsorted: 0 };
    for (const i of open) recs[i.listStrategy] = (recs[i.listStrategy] ?? 0) + 1;
    return recs;
  }, [items]);

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI icon={<ArrowDownLeft className="h-4 w-4" />} label="Einkäufe (Summe)" value={eur(aggregates.totalPurchasesCost)} sub={`${purchases.length} Einkäufe`} tone="rose" />
        <KPI icon={<Box className="h-4 w-4" />} label="Versandkosten" value={eur(aggregates.totalShippingCost)} sub="Summe Versand" tone="amber" />
        <KPI icon={<ArrowUpRight className="h-4 w-4" />} label="Umsatz" value={eur(aggregates.totalRevenue)} sub="aus Verkäufen" tone="emerald" />
        <KPI icon={<TrendingUp className="h-4 w-4" />} label="Deckungsbeitrag" value={eur(aggregates.profit)} sub={aggregates.profit >= 0 ? "Profit" : "Verlust"} tone={aggregates.profit >= 0 ? "emerald" : "rose"} />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1 text-xs">
        <Filter className="h-3.5 w-3.5 text-neutral-400 ml-1.5 mr-0.5" />
        {(["all", "active", "sold", "archived"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} className={`rounded px-3 py-1 font-medium transition-colors ${filter === s ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}>
            {s === "all" ? "Alle" : s === "active" ? "Aktiv" : s === "sold" ? "Verkauft" : "Archiv"}
          </button>
        ))}
      </div>

      {/* Per-Purchase payoff table — 4 columns + actions */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <header className="flex items-baseline justify-between border-b border-neutral-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-neutral-900">Ankäufe · Payoff</h3>
          <span className="text-[11px] text-neutral-500">{filtered.length} von {purchaseRows.length}</span>
        </header>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 w-44">Einkauf</th>
              <th className="px-4 py-3 w-32 text-right">Summe</th>
              <th className="px-4 py-3 w-32 text-right">Versand</th>
              <th className="px-4 py-3 w-32 text-right">Umsatz</th>
              <th className="px-4 py-3">Payoff</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-14 text-center text-sm text-neutral-400">Keine Einkäufe.</td></tr>
            ) : (
              filtered.map(({ purchase: p, invested, revenue, payoffPct, itemCount, soldCount }) => {
                const breakthrough = invested + Math.max(0, invested * 0.1);
                const remaining = Math.max(0, breakthrough - revenue);
                return (
                  <tr key={p.id} className="border-b border-neutral-100 last:border-0 align-top hover:bg-neutral-50/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-neutral-900">{p.supplierName || `Einkauf #${p.id}`}</p>
                      <p className="text-[10px] text-neutral-500">{itemCount} Items · {soldCount} verkauft</p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-neutral-900">{eur(p.totalPrice)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-neutral-700">{eur(p.shippingPrice)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">{eur(revenue)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-28 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${payoffPct >= 100 ? "bg-emerald-500" : payoffPct >= 50 ? "bg-amber-400" : "bg-rose-400"}`}
                            style={{ width: `${Math.min(100, payoffPct)}%` }}
                          />
                        </div>
                        <span className={`text-[11px] tabular-nums font-semibold ${payoffPct >= 100 ? "text-emerald-700" : payoffPct >= 50 ? "text-amber-700" : "text-rose-700"}`}>
                          {payoffPct.toFixed(0)} %
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-neutral-500">
                        {payoffPct >= 100
                          ? "Break-even überschritten — Gewinn!"
                          : `noch ${eur(remaining)} bis Break-even`}
                      </p>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Per-item: how long listed + recommendation */}
      <RecommendationTable items={items} stores={stores} />

      {/* Pie chart: revenue share per store */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-neutral-900">Umsatz-Anteil pro Store</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Welche Stores tragen am meisten zu deinem Umsatz bei?</p>
          </header>
          {storeRevenue.length === 0 ? (
            <div className="grid h-48 place-items-center rounded-md border border-dashed border-neutral-200 text-xs text-neutral-400">
              Noch keine Verkäufe zugeordnet
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={storeRevenue} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {storeRevenue.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => eur(value)}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e5e5", fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <header className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-neutral-900">Listing-Strategie</h3>
          </header>
          <p className="text-xs text-neutral-500">
            Empfehlung pro offenem Item, generiert aus Item-Stichworten + Store-Liste.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StrategyCard label="online" count={strategyMix.online} tone="blue" />
            <StrategyCard label="offline" count={strategyMix.offline} tone="amber" />
            <StrategyCard label="bundle" count={strategyMix.bundle} tone="emerald" />
          </div>
          <p className="mt-4 text-[11px] text-neutral-500">
            Aktiv: <strong className="text-neutral-800">{strategyMix.unsorted + strategyMix.online + strategyMix.offline + strategyMix.bundle}</strong> offene Items.
            Du kannst Empfehlungen im Ankauf pro Item automatisch generieren lassen.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Per-Item listing recommendation
// ============================================

function RecommendationTable({ items, stores }: { items: PurchaseItem[]; stores: Store[] }) {
  const listable = useMemo(() => items.filter((i) => i.status !== "sold").slice(0, 10), [items]);

  if (listable.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <header className="border-b border-neutral-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-neutral-900">Top offene Items · Strategie</h3>
        <p className="mt-0.5 text-xs text-neutral-500">Wie lange ist das Item online? Lohnt es sich, oder besser als Bundle verkaufen?</p>
      </header>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-xs font-medium uppercase tracking-wide text-neutral-500">
            <th className="px-4 py-3 w-28">Code</th>
            <th className="px-4 py-3">Titel</th>
            <th className="px-4 py-3 w-28">Online seit</th>
            <th className="px-4 py-3">Empfehlung</th>
          </tr>
        </thead>
        <tbody>
          {listable.map((item) => {
            const store = stores.find((s) => s.id === item.storeId);
            const days = item.listedAt ? Math.floor((Date.now() - new Date(item.listedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
            return (
              <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-mono text-[11px] font-semibold text-neutral-700">{item.uniqueCode}</td>
                <td className="px-4 py-3">
                  <p className="line-clamp-1 text-sm font-medium text-neutral-900">{item.title || "Ohne Titel"}</p>
                  {store && <p className="mt-0.5 text-[10px] text-neutral-500">{store.name} · {platformLabel(store.platform)}</p>}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums">{item.listedAt ? `${days} Tag${days === 1 ? "" : "e"}` : "noch nicht"}</td>
                <td className="px-4 py-3">
                  {item.recommendation ? (
                    <>
                      <p className="text-xs font-semibold text-neutral-800">{item.recommendation}</p>
                      {item.recommendationReason && <p className="mt-0.5 text-[11px] text-neutral-500">{item.recommendationReason}</p>}
                    </>
                  ) : (
                    <span className="text-[11px] text-neutral-400">Noch keine Empfehlung</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KPI({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: "neutral" | "amber" | "emerald" | "rose" }) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-50 text-neutral-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
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

function StrategyCard({ label, count, tone }: { label: string; count: number; tone: "blue" | "amber" | "emerald" }) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="rounded-md border border-neutral-200 px-3 py-3 text-center">
      <p className={`text-[10px] font-medium uppercase tracking-wide ${tones[tone]}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900">{count}</p>
    </div>
  );
}

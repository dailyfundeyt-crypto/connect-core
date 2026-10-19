import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  ArrowDownLeft,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  ImagePlus,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@flux/components/ui/button";
import { Input } from "@flux/components/ui/input";
import { useAuth } from "@flux/lib/supabase/auth";
import {
  nextItemId,
  nextPurchaseId,
  nextPurchaseUniqueCode,
  uploadItemImage,
  uploadPurchaseImage,
  type Purchase,
  type PurchaseItem,
  type Store,
} from "@flux/lib/supabase/snapshot";

const eur = (value: number) =>
  value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

type AnkaufDashboardProps = {
  purchases: Purchase[];
  items: PurchaseItem[];
  stores: Store[];
  onPurchaseChange: (next: Purchase[]) => void;
  onItemChange: (next: PurchaseItem[]) => void;
  onSold: (item: PurchaseItem, salePrice: number, customerName: string) => void;
};

type ItemFormState = {
  id: number | null;
  title: string;
  description: string;
  conditionNotes: string;
  pricePaid: string;
  shippingShare: string;
  imageUrl: string | null;
  salePrice: string;
  customerName: string;
  storeId: number | null;
  affiliateUrl: string;
  listStrategy: "online" | "offline" | "bundle" | "unsorted";
};

const emptyItemForm: ItemFormState = {
  id: null,
  title: "",
  description: "",
  conditionNotes: "",
  pricePaid: "",
  shippingShare: "",
  imageUrl: null,
  salePrice: "",
  customerName: "",
  storeId: null,
  affiliateUrl: "",
  listStrategy: "unsorted",
};

export function AnkaufDashboard({
  purchases,
  items,
  stores,
  onPurchaseChange,
  onItemChange,
  onSold,
}: AnkaufDashboardProps) {
  const auth = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Purchase["status"]>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [itemModal, setItemModal] = useState<{ purchaseId: number; item: ItemFormState } | null>(null);
  const [sellModal, setSellModal] = useState<PurchaseItem | null>(null);
  const [uploadState, setUploadState] = useState<{ uploading: boolean; error: string | null }>({ uploading: false, error: null });

  // -------- KPIs --------
  const stats = useMemo(() => {
    const totalSpent = purchases.reduce((s, p) => s + p.totalPrice + p.shippingPrice, 0);
    const totalSold = items.filter((i) => i.status === "sold").length;
    const revenueFromItems = items
      .filter((i) => i.status === "sold" && i.salePrice !== null)
      .reduce((s, i) => s + (i.salePrice ?? 0), 0);
    const investedInStock = items.filter((i) => i.status === "in_stock" || i.status === "listed").reduce((s, i) => s + i.pricePaid + i.shippingShare, 0);
    const margin = revenueFromItems - items.filter((i) => i.status === "sold").reduce((s, i) => s + i.pricePaid + i.shippingShare, 0);
    return {
      totalSpent,
      totalSold,
      revenueFromItems,
      investedInStock,
      margin,
      activePurchases: purchases.filter((p) => p.status === "active").length,
      inStockItems: items.filter((i) => i.status === "in_stock").length,
    };
  }, [purchases, items]);

  // -------- Filtering --------
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return purchases
      .filter((p) => statusFilter === "all" || p.status === statusFilter)
      .filter(
        (p) =>
          !needle ||
          p.supplierName.toLowerCase().includes(needle) ||
          p.description.toLowerCase().includes(needle) ||
          items.some((i) => i.purchaseId === p.id && i.uniqueCode.toLowerCase().includes(needle)),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [purchases, items, search, statusFilter]);

  const itemsByPurchase = useMemo(() => {
    const map = new Map<number, PurchaseItem[]>();
    for (const item of items) {
      const list = map.get(item.purchaseId) ?? [];
      list.push(item);
      map.set(item.purchaseId, list);
    }
    return map;
  }, [items]);

  // -------- Image upload helper --------
  const uploadImage = async (file: File, kind: "purchase" | "item", ctx: { purchaseId: number; code?: string }): Promise<string | null> => {
    if (!auth.client || auth.status.kind !== "signed_in") return null;
    setUploadState({ uploading: true, error: null });
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const url = kind === "item"
        ? await uploadItemImage(auth.client, auth.status.user.id, ctx.purchaseId, ctx.code ?? "x", file, ext)
        : await uploadPurchaseImage(auth.client, auth.status.user.id, ctx.purchaseId, file, ext);
      return url;
    } catch (err) {
      setUploadState({ uploading: false, error: err instanceof Error ? err.message : "Upload-Fehler" });
      return null;
    } finally {
      setUploadState((s) => ({ ...s, uploading: false }));
    }
  };

  // -------- Mutations --------
  const handleCreatePurchase = async (data: { supplierName: string; description: string; totalPrice: number; shippingPrice: number; cover?: File | null }) => {
    const id = nextPurchaseId(purchases);
    const createdAt = new Date().toISOString();
    const next: Purchase = {
      id,
      supplierName: data.supplierName,
      description: data.description,
      totalPrice: data.totalPrice,
      shippingPrice: data.shippingPrice,
      status: "active",
      itemCounter: 0,
      createdAt,
    };
    let finalNext = next;
    if (data.cover) {
      const url = await uploadImage(data.cover, "purchase", { purchaseId: id });
      if (url) finalNext = { ...next, description: `${next.description}\nCover: ${url}` };
    }
    onPurchaseChange([finalNext, ...purchases]);
    flash(`${next.supplierName || "Ankauf"} angelegt`);
    setExpandedId(id);
  };

  const handleDeletePurchase = (purchaseId: number) => {
    if (!confirm("Ankauf löschen? Alle zugehörigen Items werden ebenfalls entfernt.")) return;
    onPurchaseChange(purchases.filter((p) => p.id !== purchaseId));
    onItemChange(items.filter((i) => i.purchaseId !== purchaseId));
  };

  const handleMarkSold = (purchaseId: number) => {
    onPurchaseChange(
      purchases.map((p) => (p.id === purchaseId ? { ...p, status: "sold" as const } : p)),
    );
  };

  const handleArchivePurchase = (purchaseId: number) => {
    onPurchaseChange(
      purchases.map((p) => (p.id === purchaseId ? { ...p, status: "archived" as const } : p)),
    );
  };

  const handleOpenNewItem = (purchaseId: number) => {
    setItemModal({ purchaseId, item: emptyItemForm });
  };

  const handleOpenEditItem = (purchaseId: number, item: PurchaseItem) => {
    setItemModal({
      purchaseId,
      item: {
        id: item.id,
        title: item.title,
        description: item.description,
        conditionNotes: item.conditionNotes,
        pricePaid: String(item.pricePaid),
        shippingShare: String(item.shippingShare),
        imageUrl: item.imageUrl,
        salePrice: item.salePrice !== null ? String(item.salePrice) : "",
        customerName: "",
        storeId: item.storeId,
        affiliateUrl: item.affiliateUrl ?? "",
        listStrategy: item.listStrategy,
      },
    });
  };

  const handleSaveItem = async (purchaseId: number, form: ItemFormState, imageFile: File | null) => {
    const purchase = purchases.find((p) => p.id === purchaseId);
    if (!purchase) return;

    let imageUrl = form.imageUrl;
    if (imageFile) {
      const tmpCode = form.id ? items.find((i) => i.id === form.id)?.uniqueCode ?? "x" : "x";
      const url = await uploadImage(imageFile, "item", { purchaseId, code: tmpCode });
      if (url) imageUrl = url;
    }

    const pricePaid = parseNumber(form.pricePaid);
    const shippingShare = parseNumber(form.shippingShare);

    if (form.id !== null) {
      const updated = items.map((it) =>
        it.id === form.id
          ? {
              ...it,
              title: form.title,
              description: form.description,
              conditionNotes: form.conditionNotes,
              pricePaid,
              shippingShare,
              imageUrl,
              storeId: form.storeId,
              affiliateUrl: form.affiliateUrl || null,
              listStrategy: form.listStrategy,
            }
          : it,
      );
      onItemChange(updated);
    } else {
      const newCounter = purchase.itemCounter + 1;
      const uniqueCode = nextPurchaseUniqueCode(purchase.itemCounter);
      const newItem: PurchaseItem = {
        id: nextItemId(items),
        purchaseId,
        uniqueCode,
        title: form.title,
        description: form.description,
        conditionNotes: form.conditionNotes,
        pricePaid,
        shippingShare,
        status: "in_stock",
        imageUrl,
        extraImages: [],
        aiTitle: null,
        aiDescription: null,
        aiGeneratedAt: null,
        soldAt: null,
        salePrice: null,
        saleOrderId: null,
        storeId: form.storeId,
        listStrategy: form.listStrategy,
        affiliateUrl: form.affiliateUrl || null,
        listedAt: null,
        recommendation: "",
        recommendationReason: "",
        suggestedPrice: null,
        assignedBoxNo: null,
      };
      onItemChange([newItem, ...items]);
      onPurchaseChange(purchases.map((p) => (p.id === purchaseId ? { ...p, itemCounter: newCounter } : p)));
    }
    setItemModal(null);
  };

  const handleDeleteItem = (itemId: number) => {
    if (!confirm("Item löschen?")) return;
    onItemChange(items.filter((i) => i.id !== itemId));
  };

  const handleGenerateAI = async (item: PurchaseItem) => {
    // Platzhalter — Backend liefert Titel, Beschreibung und Zustand-Hinweise.
    // Ohne konfiguriertes AI-Backend füllen wir mit Hinweisen.
    const next: PurchaseItem = {
      ...item,
      aiTitle: item.aiTitle ?? (item.title ? `${item.title} (auto)` : "Titel wird generiert"),
      aiDescription: item.aiDescription ?? "Beschreibung wird vom AI-Backend gefüllt, sobald konfiguriert.",
      aiGeneratedAt: new Date().toISOString(),
    };
    onItemChange(items.map((i) => (i.id === item.id ? next : i)));
  };

  const handleOpenSell = (item: PurchaseItem) => {
    setSellModal(item);
  };

  const handleConfirmSell = (item: PurchaseItem, salePrice: number, customerName: string) => {
    onSold(item, salePrice, customerName);
    setSellModal(null);
  };

  const flash = (msg: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("flux:notice", { detail: msg }));
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={<Wallet className="h-4 w-4" />} label="Investiert" value={eur(stats.totalSpent)} sub={`${stats.activePurchases} aktive Einkäufe`} tone="neutral" />
        <KpiCard icon={<Box className="h-4 w-4" />} label="Im Bestand" value={`${stats.inStockItems}`} sub={`${items.length} Items insgesamt`} tone="amber" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Verkaufserlös" value={eur(stats.revenueFromItems)} sub={`${stats.totalSold} verkauft`} tone="emerald" />
        <KpiCard
          icon={<Sparkles className="h-4 w-4" />}
          label="Deckungsbeitrag"
          value={eur(stats.margin)}
          sub={stats.margin >= 0 ? "Profit" : "Verlust"}
          tone={stats.margin >= 0 ? "emerald" : "rose"}
        />
      </div>

      {/* Filters + Add */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Lieferant, Beschreibung, Item-Code …"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1">
          <Filter className="h-3.5 w-3.5 text-neutral-400 ml-1.5 mr-0.5" />
          {(["all", "active", "sold", "archived"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${statusFilter === s ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              {s === "all" ? "Alle" : s === "active" ? "Aktiv" : s === "sold" ? "Verkauft" : "Archiv"}
            </button>
          ))}
        </div>
        <Button onClick={() => setPurchaseModal(true)}>
          <Plus className="h-3.5 w-3.5" /> Neuer Ankauf
        </Button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center">
          <ArrowDownLeft className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-700">Noch keine Einkäufe</p>
          <p className="mt-1 text-xs text-neutral-500">Lege deinen ersten Ankauf an, um Schallplatten, Bücher oder andere Waren zu erfassen.</p>
          <Button className="mt-4" onClick={() => setPurchaseModal(true)}>
            <Plus className="h-3.5 w-3.5" /> Ersten Ankauf anlegen
          </Button>
        </div>
      )}

      {/* Purchase Cards */}
      <div className="grid gap-3">
        {filtered.map((purchase) => {
          const purchaseItems = itemsByPurchase.get(purchase.id) ?? [];
          const expanded = expandedId === purchase.id;
          const invested = purchase.totalPrice + purchase.shippingPrice;
          const itemRevenue = purchaseItems.filter((i) => i.status === "sold").reduce((s, i) => s + (i.salePrice ?? 0), 0);
          const itemCost = purchaseItems.reduce((s, i) => s + i.pricePaid + i.shippingShare, 0);
          const inStock = purchaseItems.filter((i) => i.status === "in_stock").length;
          const sold = purchaseItems.filter((i) => i.status === "sold").length;
          const margin = itemRevenue - itemCost;
          const marginPct = itemCost > 0 ? (margin / itemCost) * 100 : 0;

          return (
            <article
              key={purchase.id}
              className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <header className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-rose-50 text-rose-600">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="truncate text-sm font-semibold text-neutral-900">{purchase.supplierName || "Unbenannter Ankauf"}</h3>
                    <StatusPill status={purchase.status} />
                  </div>
                  {purchase.description && (
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{purchase.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-neutral-400">Preis</p>
                    <p className="text-sm font-bold tabular-nums text-neutral-900">{eur(purchase.totalPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-neutral-400">Versand</p>
                    <p className="text-sm font-semibold tabular-nums text-neutral-700">{eur(purchase.shippingPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-neutral-400">Items</p>
                    <p className="text-sm font-semibold tabular-nums text-neutral-700">{purchaseItems.length}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : purchase.id)}
                    className="ml-2 grid h-8 w-8 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                    aria-label={expanded ? "Einklappen" : "Ausklappen"}
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </div>
              </header>

              {/* Compact stats row */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-xs">
                <span className="text-neutral-500">Investiert · <strong className="font-semibold text-neutral-900 tabular-nums">{eur(invested)}</strong></span>
                <span className="text-neutral-500">Erlös · <strong className="font-semibold text-neutral-900 tabular-nums">{eur(itemRevenue)}</strong></span>
                <span className={`${margin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  Marge · <strong className="font-semibold tabular-nums">{eur(margin)}</strong>
                  <span className="ml-1 text-neutral-500">({marginPct.toFixed(1)} %)</span>
                </span>
                <span className="text-neutral-500">Bestand · <strong className="font-semibold tabular-nums">{inStock}</strong></span>
                <span className="text-neutral-500">Verkauft · <strong className="font-semibold tabular-nums">{sold}</strong></span>
              </div>

              {expanded && (
                <div className="space-y-4 border-t border-neutral-100 bg-neutral-50/50 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Items ({purchaseItems.length})</h4>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleOpenNewItem(purchase.id)}>
                        <Plus className="h-3.5 w-3.5" /> Item hinzufügen
                      </Button>
                      {purchase.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => handleMarkSold(purchase.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Als verkauft markieren
                        </Button>
                      )}
                      {purchase.status === "active" && (
                        <Button size="sm" variant="ghost" onClick={() => handleArchivePurchase(purchase.id)}>
                          Archivieren
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDeletePurchase(purchase.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {purchaseItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
                      <ImagePlus className="mx-auto h-6 w-6 text-neutral-300" />
                      <p className="mt-2 text-xs text-neutral-500">Noch keine Items erfasst.</p>
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => handleOpenNewItem(purchase.id)}>
                        <Plus className="h-3.5 w-3.5" /> Erstes Item hinzufügen
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {purchaseItems.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          onEdit={() => handleOpenEditItem(purchase.id, item)}
                          onDelete={() => handleDeleteItem(item.id)}
                          onGenerateAI={() => void handleGenerateAI(item)}
                          onSell={() => handleOpenSell(item)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {purchaseModal && (
        <PurchaseFormModal
          onClose={() => setPurchaseModal(false)}
          onSubmit={(d) => void handleCreatePurchase(d)}
          uploading={uploadState.uploading}
        />
      )}

      {itemModal && (
        <ItemFormModal
          state={itemModal.item}
          stores={stores}
          onClose={() => setItemModal(null)}
          onSave={(form, file) => void handleSaveItem(itemModal.purchaseId, form, file)}
          uploading={uploadState.uploading}
        />
      )}

      {sellModal && (
        <SellItemModal
          item={sellModal}
          onClose={() => setSellModal(null)}
          onConfirm={(salePrice, customerName) => handleConfirmSell(sellModal, salePrice, customerName)}
        />
      )}

      {uploadState.error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{uploadState.error}</p>
      )}
    </div>
  );
}

// ============================================
// Subcomponents
// ============================================

function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: "neutral" | "amber" | "emerald" | "rose" }) {
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

function StatusPill({ status }: { status: Purchase["status"] }) {
  const map: Record<Purchase["status"], { label: string; cls: string }> = {
    active: { label: "Aktiv", cls: "bg-blue-50 text-blue-700" },
    sold: { label: "Verkauft", cls: "bg-emerald-50 text-emerald-700" },
    archived: { label: "Archiv", cls: "bg-neutral-100 text-neutral-600" },
    draft: { label: "Entwurf", cls: "bg-amber-50 text-amber-700" },
  };
  const s = map[status];
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>{s.label}</span>;
}

function ItemCard({ item, onEdit, onDelete, onGenerateAI, onSell }: { item: PurchaseItem; onEdit: () => void; onDelete: () => void; onGenerateAI: () => void; onSell: () => void }) {
  const isSold = item.status === "sold";
  const margin = isSold && item.salePrice !== null ? item.salePrice - item.pricePaid - item.shippingShare : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-neutral-100">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-neutral-300">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white">
          {item.uniqueCode}
        </span>
        {item.status === "sold" && (
          <span className="absolute right-1.5 top-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">Verkauft</span>
        )}
        {item.status === "listed" && (
          <span className="absolute right-1.5 top-1.5 rounded bg-blue-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">Listing</span>
        )}
      </div>

      <div className="flex-1 px-2.5 py-2">
        <p className="line-clamp-1 text-xs font-semibold text-neutral-900">{item.title || "Ohne Titel"}</p>
        {item.description && <p className="mt-0.5 line-clamp-2 text-[10px] text-neutral-500">{item.description}</p>}
        <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums">
          <span className="font-semibold text-neutral-700">{eur(item.pricePaid)}</span>
          {margin !== null && (
            <span className={`font-semibold ${margin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{eur(margin)}</span>
          )}
        </div>
      </div>

      <div className="flex items-center border-t border-neutral-100 bg-neutral-50/50">
        <button onClick={onEdit} className="flex-1 px-2 py-1.5 text-[10px] font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Bearbeiten
        </button>
        <button onClick={onGenerateAI} className="border-l border-neutral-200 px-2 py-1.5 text-neutral-500 hover:bg-violet-50 hover:text-violet-700" aria-label="AI generieren" title="AI-Vorschlag">
          <Sparkles className="h-3 w-3" />
        </button>
        {!isSold && (
          <button onClick={onSell} className="border-l border-neutral-200 px-2 py-1.5 text-emerald-600 hover:bg-emerald-50" aria-label="Verkaufen" title="Als verkauft markieren">
            <CheckCircle2 className="h-3 w-3" />
          </button>
        )}
        <button onClick={onDelete} className="border-l border-neutral-200 px-2 py-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Löschen">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ============================================
// Modals
// ============================================

type PurchaseFormData = { supplierName: string; description: string; totalPrice: number; shippingPrice: number; cover: File | null };
function PurchaseFormModal({ onClose, onSubmit, uploading }: { onClose: () => void; onSubmit: (d: PurchaseFormData) => void; uploading: boolean }) {
  const [supplierName, setSupplierName] = useState("");
  const [description, setDescription] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [shippingPrice, setShippingPrice] = useState("");
  const [cover, setCover] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      supplierName: supplierName.trim(),
      description: description.trim(),
      totalPrice: parseNumber(totalPrice),
      shippingPrice: parseNumber(shippingPrice),
      cover,
    });
  };

  return (
    <ModalShell title="Neuer Ankauf" onClose={onClose}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <Field label="Lieferant / Quelle" required>
          <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="z.B. Nordwerk GmbH" required />
        </Field>
        <Field label="Beschreibung">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Was wurde gekauft? Warum? Worauf achten?"
            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm shadow-sm outline-none focus-visible:border-neutral-400"
            rows={2}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Preis (€)" required>
            <Input type="number" step="0.01" min="0" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} required />
          </Field>
          <Field label="Versand (€)">
            <Input type="number" step="0.01" min="0" value={shippingPrice} onChange={(e) => setShippingPrice(e.target.value)} />
          </Field>
        </div>
        <Field label="Cover-Bild (optional)">
          <FileInput file={cover} onFile={setCover} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" disabled={!supplierName.trim() || !totalPrice || uploading}>
            {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Speichern …</> : "Anlegen"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function ItemFormModal({
  state,
  stores,
  onClose,
  onSave,
  uploading,
}: {
  state: ItemFormState;
  stores: Store[];
  onClose: () => void;
  onSave: (form: ItemFormState, image: File | null) => void;
  uploading: boolean;
}) {
  const [form, setForm] = useState<ItemFormState>(state);
  const [image, setImage] = useState<File | null>(null);

  useEffect(() => setForm(state), [state]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form, image);
  };

  const set = <K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <ModalShell title={form.id ? `Item bearbeiten` : "Neues Item"} onClose={onClose}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="flex items-center gap-3">
          {form.imageUrl ? (
            <img src={form.imageUrl} alt="" className="h-16 w-16 rounded-md object-cover" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-md bg-neutral-100 text-neutral-300">
              <ImagePlus className="h-5 w-5" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-[10px] font-medium uppercase text-neutral-500">Produktbild</p>
            <FileInput file={image} onFile={setImage} small />
          </div>
        </div>

        <Field label="Titel">
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="z.B. Dark Side of the Moon" />
        </Field>
        <Field label="Beschreibung">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Details zu Zustand, Edition, Pressung …"
            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm shadow-sm outline-none focus-visible:border-neutral-400"
            rows={2}
          />
        </Field>
        <Field label="Zustand / Notizen">
          <Input value={form.conditionNotes} onChange={(e) => set("conditionNotes", e.target.value)} placeholder="VG+, Cover leicht berieben …" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Preis (€)" required>
            <Input type="number" step="0.01" min="0" value={form.pricePaid} onChange={(e) => set("pricePaid", e.target.value)} required />
          </Field>
          <Field label="Versand-Anteil (€)">
            <Input type="number" step="0.01" min="0" value={form.shippingShare} onChange={(e) => set("shippingShare", e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Store">
            <select
              value={form.storeId ?? ""}
              onChange={(e) => set("storeId", e.target.value ? Number(e.target.value) : null)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm outline-none focus-visible:border-neutral-400"
            >
              <option value="">— ohne Store —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Strategie">
            <select
              value={form.listStrategy}
              onChange={(e) => set("listStrategy", e.target.value as ItemFormState["listStrategy"])}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm outline-none focus-visible:border-neutral-400"
            >
              <option value="unsorted">unsorted</option>
              <option value="online">online (Einzel-Listing)</option>
              <option value="offline">offline (Flohmarkt / Börse)</option>
              <option value="bundle">Bundle / Karton</option>
            </select>
          </Field>
        </div>

        <Field label="Affiliate-/Vergleichs-Link (optional)">
          <Input
            value={form.affiliateUrl}
            onChange={(e) => set("affiliateUrl", e.target.value)}
            placeholder="https://www.amazon.de/s?k=…"
            inputMode="url"
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" disabled={!form.pricePaid || uploading}>
            {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Speichern …</> : "Speichern"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function SellItemModal({ item, onClose, onConfirm }: { item: PurchaseItem; onClose: () => void; onConfirm: (salePrice: number, customerName: string) => void }) {
  const [salePrice, setSalePrice] = useState("");
  const [customerName, setCustomerName] = useState("");

  const profit = parseNumber(salePrice) - item.pricePaid - item.shippingShare;
  const marginPct = item.pricePaid + item.shippingShare > 0 ? (profit / (item.pricePaid + item.shippingShare)) * 100 : 0;

  return (
    <ModalShell title={`Verkaufen · ${item.uniqueCode}`} onClose={onClose}>
      <div className="space-y-3">
        {item.imageUrl && <img src={item.imageUrl} alt="" className="h-32 w-full rounded-md object-cover" />}
        <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs">
          <p><strong>{item.title || "Ohne Titel"}</strong></p>
          <p className="mt-0.5 text-neutral-500">Einkauf: {eur(item.pricePaid + item.shippingShare)}</p>
        </div>

        <Field label="Kunde">
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="z.B. Atelier Hansen" />
        </Field>
        <Field label="Verkaufspreis (€)" required>
          <Input type="number" step="0.01" min="0" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} required autoFocus />
        </Field>

        {salePrice && (
          <div className={`rounded-md px-3 py-2 text-xs ${profit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            <p className="font-semibold">Deckungsbeitrag: {eur(profit)}</p>
            <p className="mt-0.5">Marge: {marginPct.toFixed(1)} %</p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button type="button" onClick={() => onConfirm(parseNumber(salePrice), customerName.trim())} disabled={!salePrice}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Verkauf bestätigen
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================
// Small helpers
// ============================================

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 px-4">
      <div className="relative w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Schließen">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        {label}{required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function FileInput({ file, onFile, small }: { file: File | null; onFile: (f: File | null) => void; small?: boolean }) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  };
  return (
    <div className={`flex items-center gap-2 rounded-md border border-dashed border-neutral-300 px-3 ${small ? "py-1.5" : "py-2"}`}>
      <Upload className="h-3.5 w-3.5 text-neutral-400" />
      <input type="file" accept="image/*" onChange={handleChange} className="hidden" id="file-input" />
      <label htmlFor="file-input" className="flex-1 cursor-pointer truncate text-xs text-neutral-600">
        {file ? file.name : "Bild auswählen …"}
      </label>
      {file && (
        <button type="button" onClick={() => onFile(null)} className="text-neutral-400 hover:text-rose-600" aria-label="Entfernen">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function parseNumber(s: string): number {
  const n = Number(s.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

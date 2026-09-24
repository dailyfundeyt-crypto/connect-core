/**
 * Connect Marketplace — affiliate discovery for bots & whole companies.
 *
 * Customers search here; checkout / swipe / forms stay on the seller’s site.
 * We only send traffic. Mirks (memecoins on Solana / Pump.fun) show as
 * live read-only quotes — never tradeable inside Connect. After an off-app
 * purchase, buyers redeem an access code. Optional NFT serial later
 * (see `nft-notes.ts`).
 */

export type ListingKind = "bot" | "company";
export type ListingOffer = "sale" | "rent";

export type MarketplaceListing = {
  id: string;
  kind: ListingKind;
  /** Bot id or company id */
  targetId: string;
  title: string;
  description: string;
  offer: ListingOffer;
  /** Display-only price hint; checkout happens on sellerUrl */
  priceLabel: string;
  /** Seller’s own swipe / form page — Connect only sends traffic */
  sellerUrl: string;
  /** Unique serial / bot number shown publicly */
  serial: string;
  sellerName: string;
  companyId?: string;
  /** Pump.fun / Solana Mirks — live quote display only, no invest here */
  memecoinUrl?: string;
  memecoinTicker?: string;
  createdAt: string;
};

export type OwnedAsset = {
  id: string;
  kind: ListingKind;
  targetId: string;
  title: string;
  serial: string;
  redeemedAt: string;
  listingId?: string;
};

export type RedeemCode = {
  code: string;
  kind: ListingKind;
  targetId: string;
  title: string;
  serial: string;
  listingId?: string;
  /** One-time; cleared after redeem */
  used?: boolean;
};

const LISTINGS_KEY = "connect.marketplace.listings";
const OWNED_KEY = "connect.marketplace.owned";
const CODES_KEY = "connect.marketplace.codes";
const EVENT = "connect-marketplace-changed";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(EVENT));
  void import("@/lib/companies/workspace-sync").then((m) =>
    m.scheduleConnectWorkspacePush(),
  );
}

export function subscribeMarketplace(cb: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** BOT-XXXX-XXXX style serial from target id + entropy */
export function makeSerial(prefix: "BOT" | "CO" | "NFT", seed: string): string {
  const base = seed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4) || "XXXX";
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${base}-${rand}`;
}

export function makeRedeemCode(): string {
  const a = Math.random().toString(36).slice(2, 6).toUpperCase();
  const b = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CB-${a}-${b}`;
}

export function listListings(): MarketplaceListing[] {
  return readJson<MarketplaceListing[]>(LISTINGS_KEY, []).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function listOwned(): OwnedAsset[] {
  return readJson<OwnedAsset[]>(OWNED_KEY, []).sort((a, b) =>
    b.redeemedAt.localeCompare(a.redeemedAt),
  );
}

export function listCodes(): RedeemCode[] {
  return readJson<RedeemCode[]>(CODES_KEY, []);
}

export function publishListing(
  input: Omit<MarketplaceListing, "id" | "serial" | "createdAt"> & {
    serial?: string;
  },
): { listing: MarketplaceListing; code: string } {
  const serial =
    input.serial ??
    makeSerial(input.kind === "company" ? "CO" : "BOT", input.targetId);
  const listing: MarketplaceListing = {
    ...input,
    id: `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    serial,
    createdAt: new Date().toISOString(),
  };
  writeJson(LISTINGS_KEY, [listing, ...listListings()]);
  const code = makeRedeemCode();
  const codes = listCodes();
  codes.push({
    code,
    kind: listing.kind,
    targetId: listing.targetId,
    title: listing.title,
    serial: listing.serial,
    listingId: listing.id,
  });
  writeJson(CODES_KEY, codes);
  return { listing, code };
}

export function redeemCode(raw: string): OwnedAsset {
  const code = raw.trim().toUpperCase();
  if (!code) throw new Error("Code eingeben.");
  const codes = listCodes();
  const entry = codes.find((c) => c.code.toUpperCase() === code);
  if (!entry) throw new Error("Unbekannter Code.");
  if (entry.used) throw new Error("Code wurde bereits eingelöst.");

  const owned = listOwned();
  if (owned.some((o) => o.kind === entry.kind && o.targetId === entry.targetId)) {
    entry.used = true;
    writeJson(CODES_KEY, codes);
    throw new Error("Diesen Bot/dieses Unternehmen besitzt du bereits.");
  }

  const asset: OwnedAsset = {
    id: `own-${Date.now().toString(36)}`,
    kind: entry.kind,
    targetId: entry.targetId,
    title: entry.title,
    serial: entry.serial,
    redeemedAt: new Date().toISOString(),
    listingId: entry.listingId,
  };
  entry.used = true;
  writeJson(CODES_KEY, codes);
  writeJson(OWNED_KEY, [asset, ...owned]);
  return asset;
}

export function ownsTarget(kind: ListingKind, targetId: string): boolean {
  return listOwned().some((o) => o.kind === kind && o.targetId === targetId);
}

export function searchListings(query: string): MarketplaceListing[] {
  const q = query.trim().toLowerCase();
  const all = listListings();
  if (!q) return all;
  return all.filter(
    (l) =>
      l.title.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.serial.toLowerCase().includes(q) ||
      l.sellerName.toLowerCase().includes(q) ||
      (l.memecoinTicker ?? "").toLowerCase().includes(q),
  );
}

/** Demo catalog so Bots suchen is not empty on first open. */
export function ensureMarketplaceSeed() {
  if (listListings().length > 0) return;
  const samples: Omit<MarketplaceListing, "id" | "serial" | "createdAt">[] = [
    {
      kind: "bot",
      targetId: "spark",
      title: "Spark · Creative lead",
      description:
        "Creative-Bot finden. Kauf/Miete per Swipe auf der Anbieter-Seite — Connect leitet nur weiter.",
      offer: "rent",
      priceLabel: "€49 / Woche",
      sellerUrl: "https://example.com/sell/spark",
      sellerName: "Lumen Studio",
      companyId: "lumen",
    },
    {
      kind: "bot",
      targetId: "analysis",
      title: "Analysis · Research",
      description:
        "Research-Bot im Katalog. Formular/Swipe beim Anbieter; Serial nach Kauf hier freischalten.",
      offer: "sale",
      priceLabel: "€390",
      sellerUrl: "https://example.com/sell/analysis",
      sellerName: "Nordwind Ops",
      companyId: "nordwind",
    },
    {
      kind: "company",
      targetId: "helm",
      title: "Unternehmen · Helm",
      description:
        "Ganzes Unternehmen im Katalog. Live-Mirks-Kurs zum Mitlesen; Handel auf Pump.fun, Kauf auf der Anbieter-Seite.",
      offer: "sale",
      priceLabel: "€12.000",
      sellerUrl: "https://example.com/sell/helm-co",
      sellerName: "Helm Founders",
      companyId: "helm",
      memecoinTicker: "$HELM",
      memecoinUrl: "https://pump.fun",
    },
  ];
  for (const s of samples) {
    publishListing(s);
  }
}

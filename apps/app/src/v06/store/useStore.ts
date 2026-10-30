/**
 * Store API Hook and Client (v06)
 * Handles listing retrieval, category filtering, search, package installation,
 * upload wizard submissions, and review queue management.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { API_PATHS_V06 } from "@/contracts/v06/api-paths";
import type {
  StoreListing,
  StoreKind,
  StoreListingStatus,
  StoreSortOption,
  ConnectPackageManifest,
  InstallResult,
  ReviewResult,
  UploadResult,
  StoreInstallRecord,
} from "./types";

// Fallback seed listings in case of network latency or initial empty store
const FALLBACK_SEEDS: (StoreListing & { downloadsCount: number; rating: number; createdAt: string })[] = [
  {
    id: "listing-mcp-github",
    kind: "mcp",
    slug: "github-connector-mcp",
    name: "GitHub Connector MCP",
    version: "1.2.0",
    authorId: "stefan",
    iconUrl: "/brand/connect-logo.png",
    screenshots: ["/brand/connect-logo.png"],
    summary: "Ermöglicht Bots Zugriff auf Repositories, PRs und Issues.",
    description:
      "Verbindet Connect-Agenten über das Model Context Protocol direkt mit GitHub. Liest und modifiziert Issues und Pull Requests.",
    installSpec: {
      serverId: "github-connector",
      title: "GitHub Connector",
      vendor: "GitHub",
      url: "mcp://github.com",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      permissions: ["network:outbound", "mcp:access"],
    },
    priceCents: 0,
    status: "published",
    downloadsCount: 520,
    rating: 5.0,
    createdAt: "2026-10-23T10:00:00Z",
  },
  {
    id: "listing-tool-markettrace",
    kind: "tool",
    slug: "markettrace",
    name: "MarketTrace Analysis",
    version: "1.0.0",
    authorId: "stefan",
    iconUrl: "/brand/analysis-logo.png",
    screenshots: ["/brand/analysis-logo.png"],
    summary: "Echtzeit-Finanzdaten, Charts und Markt-Sentiment.",
    description:
      "Interaktives Tool zur schnellen Visualisierung von Wertpapierkursen, Indizes und Portfolio-Analysen direkt in Connect.",
    installSpec: {
      toolId: "markettrace",
      name: "MarketTrace Analysis",
      logoUrl: "/brand/analysis-logo.png",
      kind: "custom",
      url: "https://markettrace.io",
      permissions: ["network:outbound"],
    },
    priceCents: 0,
    status: "published",
    downloadsCount: 340,
    rating: 4.9,
    createdAt: "2026-10-22T10:00:00Z",
  },
  {
    id: "listing-skill-social-curator",
    kind: "skill",
    slug: "social-curator",
    name: "Social Content Kurator",
    version: "1.0.0",
    authorId: "stefan",
    iconUrl: "/brand/spark-logo.jpg",
    screenshots: ["/brand/spark-logo.jpg"],
    summary: "Erstellt X- und LinkedIn-Beiträge aus Notizen und Links.",
    description:
      "Generiert packende Kurzbeiträge mit Hashtags und Medienvorschlägen aus dem aktuellen Projektkontext und Notizen.",
    installSpec: {
      slug: "social-curator",
      title: "Social Content Kurator",
      summary: "Erstellt Social-Posts",
      instructions: "Du bist ein erfahrener Social-Media-Manager. Verfasse klare, engagierende Beiträge.",
      tools: ["brain", "connect-sozial"],
      permissions: ["channel:read", "channel:post"],
    },
    priceCents: 0,
    status: "published",
    downloadsCount: 210,
    rating: 4.8,
    createdAt: "2026-10-21T10:00:00Z",
  },
  {
    id: "listing-company-startup",
    kind: "company",
    slug: "startup-starter-kit",
    name: "Startup Starter Kit",
    version: "1.0.0",
    authorId: "stefan",
    iconUrl: "/flux-logo.png",
    screenshots: ["/flux-logo.png"],
    summary: "Komplette Firmenvorlage mit Analyst, Coder und Standard-Tools.",
    description:
      "Optimierte Struktur für moderne Entwickler-Teams mit vorinstallierten Bots, vorgefertigten Kanälen und Workflows.",
    installSpec: {
      name: "Startup Tech Labs",
      description: "Agile Softwareentwicklung und KI-Prototyping",
      accent: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
      tools: ["analysis", "flux", "brain", "connect-sozial"],
      agentIds: ["analyst", "coder"],
      permissions: ["company:manage", "agent:execute"],
    },
    priceCents: 0,
    status: "published",
    downloadsCount: 95,
    rating: 4.9,
    createdAt: "2026-10-20T10:00:00Z",
  },
  {
    id: "listing-skill-link-curator",
    kind: "skill",
    slug: "link-curator",
    name: "Link-Kurator (Instagram → Spark)",
    version: "1.0.0",
    authorId: "stefan",
    iconUrl: "/brand/spark-logo.jpg",
    screenshots: ["/brand/spark-logo.jpg"],
    summary: "Extrahiert Tools aus Instagram-Videos via getthescript.app und sortiert Links + Notizen in Spark ein.",
    description:
      "Intelligenter Kurator-Agent auf Basis der Antigravity-CLI. Analysiert Instagram-Reels und -Videos im isolierten Helium-Browser-Profil, transkribiert Inhalte via getthescript.app, filtert Software-Tools heraus und legt Links samt Notizen in Spark-Browser-Ordnern ab. Strikter Duplikatschutz und sicherer Dry-Run-Modus.",
    installSpec: {
      slug: "link-curator",
      title: "Link-Kurator (Instagram → Spark)",
      agentId: "agent_link_curator",
      cliCommand: "agy run link-curator",
      cliProvider: "antigravity",
      instructions:
        "Du bist der Link-Kurator-Agent. Du transkribierst Instagram-Reels via getthescript.app im isolierten Browser-Profil und speicherst extrahierte Tools in Spark-Ordnern.",
      tools: ["spark-mcp"],
      browserProfile: "agent_link_curator",
      defaultDryRun: true,
      featureFlag: "linkCurator",
      permissions: ["mcp:access", "filesystem:read"],
    },
    priceCents: 0,
    status: "published",
    downloadsCount: 145,
    rating: 5.0,
    createdAt: "2026-10-23T18:00:00Z",
  },
];

function toApiUrl(path: string): string {
  if (typeof window === "undefined") {
    return `http://localhost:3101${path}`;
  }
  return path;
}

export interface FetchListingsParams {
  q?: string;
  kind?: StoreKind | "all";
  status?: StoreListingStatus;
  authorId?: string;
}

export async function fetchStoreListings(params: FetchListingsParams = {}): Promise<StoreListing[]> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.kind && params.kind !== "all") query.set("kind", params.kind);
  if (params.status) query.set("status", params.status);
  if (params.authorId) query.set("authorId", params.authorId);

  const rawPath = `${API_PATHS_V06.storeListings}${query.toString() ? `?${query.toString()}` : ""}`;
  const url = toApiUrl(rawPath);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      if (res.status === 404) {
        // Fallback for development without active server flag
        return filterFallback(params);
      }
      throw new Error(`Server returned ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    return filterFallback(params);
  } catch (err) {
    console.warn("fetchStoreListings failed, using local fallback seeds:", err);
    return filterFallback(params);
  }
}

export function sortListings(
  items: StoreListing[],
  sortBy: StoreSortOption = "popular",
  searchQuery?: string,
): StoreListing[] {
  const result = [...items];
  const q = searchQuery?.toLowerCase().trim();

  if (q) {
    // Relevance scoring for search queries:
    // 1. Exact name match (highest)
    // 2. Name prefix match
    // 3. Name contains query
    // 4. Slug contains query
    // 5. Summary / description contains query
    const scoreItem = (item: StoreListing): number => {
      const name = item.name.toLowerCase();
      const slug = item.slug.toLowerCase();
      const summary = (item.summary || "").toLowerCase();
      const desc = (item.description || "").toLowerCase();

      if (name === q) return 100;
      if (name.startsWith(q)) return 80;
      if (name.includes(q)) return 60;
      if (slug.includes(q)) return 40;
      if (summary.includes(q) || desc.includes(q)) return 20;
      return 0;
    };

    return result.sort((a, b) => {
      const scoreDiff = scoreItem(b) - scoreItem(a);
      if (scoreDiff !== 0) return scoreDiff;
      const popA = (a as any).downloadsCount ?? 0;
      const popB = (b as any).downloadsCount ?? 0;
      return popB - popA;
    });
  }

  switch (sortBy) {
    case "popular":
      // Standard Play Store sorting: Highest installs & engagement first
      return result.sort((a, b) => {
        const popA = (a as any).downloadsCount ?? 0;
        const popB = (b as any).downloadsCount ?? 0;
        if (popB !== popA) return popB - popA;
        return a.name.localeCompare(b.name);
      });
    case "newest":
      // Newest additions first
      return result.sort((a, b) => {
        const dateA = (a as any).createdAt || "1970-01-01";
        const dateB = (b as any).createdAt || "1970-01-01";
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return a.name.localeCompare(b.name);
      });
    case "alphabetical":
      return result.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return result;
  }
}

function filterFallback(params: FetchListingsParams): StoreListing[] {
  let list = FALLBACK_SEEDS;
  if (params.kind && params.kind !== "all") {
    list = list.filter((i) => i.kind === params.kind);
  }
  if (params.q) {
    const q = params.q.toLowerCase().trim();
    list = list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.slug.toLowerCase().includes(q),
    );
  }
  return sortListings(list, "popular", params.q);
}

export async function fetchStoreListingById(id: string): Promise<StoreListing | null> {
  const url = toApiUrl(`${API_PATHS_V06.storeListings}/${encodeURIComponent(id)}`);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (!res.ok) {
      const match = FALLBACK_SEEDS.find((s) => s.id === id || s.slug === id);
      return match || null;
    }
    return await res.json();
  } catch {
    const match = FALLBACK_SEEDS.find((s) => s.id === id || s.slug === id);
    return match || null;
  }
}

export async function installStorePackage(
  listingId: string,
  targetCompanyId: string,
  options: {
    confirmPermissions?: boolean;
    acceptedPermissions?: string[];
  } = {},
): Promise<InstallResult> {
  const url = toApiUrl(API_PATHS_V06.storeInstall(listingId));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        targetCompanyId,
        confirmPermissions: options.confirmPermissions ?? true,
        acceptedPermissions: options.acceptedPermissions ?? [],
      }),
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Netzwerkfehler bei der Installation.",
    };
  }
}

export async function uploadStorePackage(
  manifest: ConnectPackageManifest,
  archive?: Blob | File,
): Promise<UploadResult> {
  const url = toApiUrl(API_PATHS_V06.storeUpload);

  try {
    let res: Response;
    if (archive) {
      const formData = new FormData();
      formData.append("manifest", JSON.stringify(manifest));
      formData.append("package", archive);
      res = await fetch(url, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
    } else {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify(manifest),
      });
    }

    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `Upload fehlgeschlagen (${res.status})`,
        details: Array.isArray(data.details) ? data.details : undefined,
      };
    }
    return data;
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Netzwerkfehler beim Hochladen des Pakets.",
    };
  }
}

export async function reviewStorePackage(
  listingId: string,
  action: "approve" | "reject",
  reason?: string,
): Promise<ReviewResult> {
  // TODO-CONTRACT: storeReview route in API_PATHS_V06
  const url = toApiUrl(`${API_PATHS_V06.storeListings}/${encodeURIComponent(listingId)}/review`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ action, reason }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || `Review fehlgeschlagen (${res.status})` };
    }
    return data;
  } catch (err: any) {
    return { ok: false, error: err?.message || "Fehler beim Ausführen des Reviews." };
  }
}

export async function fetchCompanyInstalls(companyId: string): Promise<StoreInstallRecord[]> {
  // TODO-CONTRACT: storeInstalls route in API_PATHS_V06
  const url = toApiUrl(`/api/v06/store/installs?companyId=${encodeURIComponent(companyId)}`);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export interface UseStoreOptions {
  companyId?: string;
  initialKind?: StoreKind | "all";
  initialSortBy?: StoreSortOption;
}

export function useStore(options: UseStoreOptions = {}) {
  const { companyId = "flux", initialKind = "all", initialSortBy = "popular" } = options;

  const [rawListings, setRawListings] = useState<StoreListing[]>([]);
  const [installs, setInstalls] = useState<StoreInstallRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedKind, setSelectedKind] = useState<StoreKind | "all">(initialKind);
  const [sortBy, setSortBy] = useState<StoreSortOption>(initialSortBy);

  // Dialog / Detail Modals
  const [selectedListing, setSelectedListing] = useState<StoreListing | null>(null);
  const [isInstallOpen, setIsInstallOpen] = useState<boolean>(false);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);

  // Load listings & installs
  const loadStore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, companyInstalls] = await Promise.all([
        fetchStoreListings({ q: searchQuery, kind: selectedKind, status: "published" }),
        fetchCompanyInstalls(companyId),
      ]);
      setRawListings(items);
      setInstalls(companyInstalls);
    } catch (err: any) {
      setError(err?.message || "Fehler beim Laden des Stores.");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedKind, companyId]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  // Sorted and filtered listings
  const listings = useMemo(() => {
    return sortListings(rawListings, sortBy, searchQuery);
  }, [rawListings, sortBy, searchQuery]);

  // Lookup map of installed listing IDs for the active company
  const installedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const inst of installs) {
      if (inst.status === "active") {
        map[inst.listingId] = true;
      }
    }
    return map;
  }, [installs]);

  // Execute install
  const installItem = useCallback(
    async (
      listing: StoreListing,
      targetCompanyId: string,
      acceptedPermissions?: string[],
    ): Promise<InstallResult> => {
      const res = await installStorePackage(listing.id, targetCompanyId, {
        confirmPermissions: true,
        acceptedPermissions,
      });

      if (res.ok) {
        // Optimistic UI update
        setInstalls((prev) => [
          ...prev,
          {
            id: `inst-${targetCompanyId}-${listing.slug}`,
            listingId: listing.id,
            companyId: targetCompanyId,
            version: listing.version,
            installedBy: "user",
            installedAt: new Date().toISOString(),
            status: "active",
            permissionsAccepted: acceptedPermissions || [],
          },
        ]);
      }
      return res;
    },
    [],
  );

  // Execute review action
  const reviewPackage = useCallback(
    async (listingId: string, action: "approve" | "reject", reason?: string): Promise<ReviewResult> => {
      const res = await reviewStorePackage(listingId, action, reason);
      if (res.ok) {
        await loadStore();
      }
      return res;
    },
    [loadStore],
  );

  // Fetch pending review items
  const fetchReviewQueue = useCallback(async (): Promise<StoreListing[]> => {
    const queue = await fetchStoreListings({ status: "review" });
    return queue;
  }, []);

  return {
    listings,
    installedMap,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedKind,
    setSelectedKind,
    sortBy,
    setSortBy,
    selectedListing,
    setSelectedListing,
    isInstallOpen,
    setIsInstallOpen,
    isWizardOpen,
    setIsWizardOpen,
    isReviewOpen,
    setIsReviewOpen,
    reload: loadStore,
    installItem,
    submitPackage: uploadStorePackage,
    reviewPackage,
    fetchReviewQueue,
  };
}

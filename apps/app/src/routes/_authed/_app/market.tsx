import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  IconBuildingStore,
  IconCategory,
  IconCheck,
  IconChevronDown,
  IconDownload,
  IconPackage,
  IconPlugConnected,
  IconRobot,
  IconSparkles,
  IconTool,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useCompanySwitcher } from "@/components/companies/company-switcher";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { StaggerItem } from "@/components/layout/stagger";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  type MarketListing,
  type MarketPricing,
  type SoftwarePackage,
  useMarketListings,
} from "@/lib/market/catalog";
import { cn } from "@/lib/utils";
import { PublishDialog } from "@/components/market/publish-dialog";

type SectionId = "companies" | "agents" | "mcp" | "tools" | "software";

export const Route = createFileRoute("/_authed/_app/market")({
  validateSearch: (search: Record<string, unknown>): { item?: string; section?: string } => ({
    item: typeof search.item === "string" ? search.item : undefined,
    section: typeof search.section === "string" ? search.section : undefined,
  }),
  component: MarketScreen,
});

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  description: string;
  icon: typeof IconBuildingStore;
}> = [
  {
    id: "companies",
    label: "Unternehmen",
    description: "Komplette Workspaces kaufen oder abonnieren.",
    icon: IconBuildingStore,
  },
  {
    id: "agents",
    label: "Agenten",
    description: "Bots kaufen, mieten oder kostenlos hinzufügen.",
    icon: IconRobot,
  },
  {
    id: "mcp",
    label: "MCP-Server",
    description: "Werkzeug-Server als Brücke zu externen Diensten.",
    icon: IconPlugConnected,
  },
  {
    id: "tools",
    label: "Tools",
    description: "Kleine Module für deinen Connect-Workspace.",
    icon: IconTool,
  },
  {
    id: "software",
    label: "Software",
    description: "Klassische Downloads (.zip, .exe, npm, pip, …) — ein Klick und du hast es.",
    icon: IconPackage,
  },
];

function pricingLabel(pricing: MarketPricing): string {
  switch (pricing.kind) {
    case "free":
      return pricing.label;
    case "buy":
      return `${pricing.price} einmalig`;
    case "rent":
      return `${pricing.price} / ${pricing.period}`;
    case "subscription":
      return `${pricing.price} / ${pricing.period}`;
  }
}

function pricingTone(pricing: MarketPricing): string {
  switch (pricing.kind) {
    case "free":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "buy":
      return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "rent":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "subscription":
      return "bg-violet-500/15 text-violet-300 ring-violet-500/30";
  }
}

function formatBytes(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

function ListingCard({
  listing,
  isInstalled,
  actionLabel,
  onAction,
  actionTone,
  active,
  onOpen,
}: {
  listing: MarketListing;
  isInstalled: boolean;
  actionLabel: string;
  onAction: () => void;
  actionTone: "primary" | "danger";
  active: boolean;
  onOpen: () => void;
}) {
  const isSoftware = listing.kind === "software";
  return (
    <div
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:border-white/20 hover:bg-white/[0.04]",
        active && "border-sky-400/50 bg-sky-500/5 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex items-start gap-3 text-left"
      >
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-semibold text-white"
          style={{
            background: `linear-gradient(135deg, ${listing.logoColor}, ${listing.logoColor}88)`,
            boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.12)`,
          }}
          aria-hidden
        >
          {listing.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
              {listing.name}
            </h3>
            {listing.badge ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  listing.badge === "NEU" && "bg-emerald-500/15 text-emerald-300",
                  listing.badge === "BETA" && "bg-amber-500/15 text-amber-300",
                  listing.badge === "HOT" && "bg-rose-500/15 text-rose-300",
                )}
              >
                {listing.badge}
              </span>
            ) : null}
            {isInstalled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                <IconCheck className="size-3" /> Installiert
              </span>
            ) : null}
            {listing.selfPublished ? (
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                Eigen
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {listing.tagline}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground/80">
            <span className="inline-flex items-center gap-1">
              <IconCategory className="size-3" /> {listing.category}
            </span>
            <span className="opacity-50">·</span>
            <span>{listing.seller}</span>
            {isSoftware && listing.download ? (
              <>
                <span className="opacity-50">·</span>
                <span>
                  v{listing.download.version} · {formatBytes(listing.download.sizeMb)}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1",
            pricingTone(listing.pricing),
          )}
        >
          {pricingLabel(listing.pricing)}
        </span>
        {isSoftware ? (
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground/90"
            onClick={onAction}
            type="button"
          >
            <IconDownload className="size-3.5" />
            {actionLabel}
          </button>
        ) : (
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              actionTone === "primary"
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "border border-rose-400/30 text-rose-300 hover:bg-rose-500/10",
            )}
            onClick={onAction}
            type="button"
          >
            {actionTone === "primary" ? (
              <IconDownload className="size-3.5" />
            ) : (
              <IconX className="size-3.5" />
            )}
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function downloadPackage(pkg: SoftwarePackage) {
  const a = document.createElement("a");
  a.href = pkg.url;
  a.download = pkg.fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}

function DetailPanel({
  listing,
  installed,
  onClose,
  onInstall,
  onUninstall,
  onDownload,
  activeCompanyId,
  onAutoStart,
  isAutoStart,
}: {
  listing: MarketListing;
  installed: boolean;
  onClose: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onDownload: () => void;
  activeCompanyId: string | null;
  onAutoStart: (next: boolean) => void;
  isAutoStart: boolean;
}) {
  const isSoftware = listing.kind === "software";
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/60 backdrop-blur-sm">
      <button
        aria-label="Detail schließen"
        className="flex-1 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden border-l border-white/10 bg-background text-foreground shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div
              className="flex size-12 items-center justify-center rounded-xl text-lg font-semibold text-white"
              style={{
                background: `linear-gradient(135deg, ${listing.logoColor}, ${listing.logoColor}88)`,
                boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.12)`,
              }}
            >
              {listing.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {listing.name}
              </h2>
              <p className="text-xs text-muted-foreground">
                {listing.category} · {listing.seller}
                {listing.publishedAt ? ` · ${listing.publishedAt}` : ""}
              </p>
            </div>
          </div>
          <button
            className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <IconX className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <span
            className={cn(
              "inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1",
              pricingTone(listing.pricing),
            )}
          >
            {pricingLabel(listing.pricing)}
          </span>
          <h3 className="mt-3 text-base font-semibold">Über dieses Angebot</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {listing.tagline}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-foreground/90">
            {listing.details}
          </p>

          {isSoftware && listing.download ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h4 className="text-sm font-semibold">Paket</h4>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Format</dt>
                <dd className="font-mono">.{listing.download.format}</dd>
                <dt className="text-muted-foreground">Größe</dt>
                <dd>{formatBytes(listing.download.sizeMb)}</dd>
                <dt className="text-muted-foreground">Version</dt>
                <dd>v{listing.download.version}</dd>
                <dt className="text-muted-foreground">Plattform</dt>
                <dd>{listing.download.platform}</dd>
                {listing.download.checksum ? (
                  <>
                    <dt className="text-muted-foreground">Prüfsumme</dt>
                    <dd className="font-mono text-[10px]">{listing.download.checksum}</dd>
                  </>
                ) : null}
              </dl>
              {listing.download.requirements?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold">Voraussetzungen</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {listing.download.requirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {!isSoftware && listing.kind !== "company" ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h4 className="text-sm font-semibold">In deinem Workspace</h4>
              {installed ? (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Installiert in deinem Konto. Du kannst es in jeder aktiven
                    Company unter „Tools" sehen.
                  </p>
                  {activeCompanyId ? (
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={isAutoStart}
                        onChange={(e) => onAutoStart(e.target.checked)}
                        className="mt-0.5 size-4 rounded border-white/20 bg-white/5"
                      />
                      <span>
                        <span className="font-medium text-foreground">
                          Beim Wechsel in „{activeCompanyId}" automatisch öffnen
                        </span>
                        <span className="block text-muted-foreground/80">
                          Lässt das Tool sofort im rechten Panel starten, sobald
                          du diese Company aktivierst.
                        </span>
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Noch nicht installiert. Mit „Installieren" fügst du es deinem
                  Konto hinzu und kannst es in deinen Companies freischalten.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 p-4">
          <button
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-white/5"
            onClick={onClose}
            type="button"
          >
            Schließen
          </button>
          {isSoftware ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background hover:bg-foreground/90"
              onClick={onDownload}
              type="button"
            >
              <IconDownload className="size-3.5" /> Herunterladen
            </button>
          ) : installed ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
              onClick={onUninstall}
              type="button"
            >
              <IconX className="size-3.5" /> Deinstallieren
            </button>
          ) : (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background hover:bg-foreground/90"
              onClick={onInstall}
              type="button"
            >
              <IconDownload className="size-3.5" /> Installieren
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Market — Companies, Agents, MCP-Server, Tools und Software in einer Oberfläche.
 *
 * Layout (alles auf einer Seite, ohne Tabs):
 *   • oben:  "Meine Connect-Bots" (vom User bereits genutzte / geteilte Bots)
 *   • darunter, als Sektionen untereinander: Companies / Agents / MCP / Tools / Software
 *   • pro Sektion: Filter (Suche + Kategorie) und ein Grid der Listings
 *   • rechtes Detail-Panel: ausgewähltes Listing mit Install/Download
 *
 * Jede Sektion kann mit einem Klick auf den Header ein-/ausgeklappt werden, damit
 * lange Listen die anderen Sektionen nicht aus dem Blick drängen.
 *
 * "Veröffentlichen" — ein Klick oben rechts öffnet den PublishDialog, der
 * entweder ein klassisches Software-Paket (zip/exe/npm) oder einen Eintrag
 * im Verzeichnis (Tool/MCP/Agent/Company) anlegt.
 */
function MarketScreen() {
  const { item } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { listings, install, uninstall, toggleAutoStart, isAutoStart } =
    useMarketListings();
  const { active: activeCompany } = useCompanySwitcher();
  const activeCompanyId = activeCompany?.id ?? null;

  const [publishOpen, setPublishOpen] = useState(false);
  // Pro Sektion eigener Such- und Kategorie-State, damit das Tippen in
  // einer Sektion die anderen nicht filtert.
  const [perSectionSearch, setPerSectionSearch] = useState<
    Record<SectionId, string>
  >({ companies: "", agents: "", mcp: "", tools: "", software: "" });
  const [perSectionCategory, setPerSectionCategory] = useState<
    Record<SectionId, string | null>
  >({ companies: null, agents: null, mcp: null, tools: null, software: null });
  // Welche Sektionen sind ausgeklappt? Standard: alle offen. Der User
  // kann Sektionen einklappen, wenn er nur einen Teil der Seite sehen will.
  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({
    companies: false,
    agents: false,
    mcp: false,
    tools: false,
    software: false,
  });

  const sectionListings = (id: SectionId) => {
    const q = perSectionSearch[id].trim().toLowerCase();
    const cat = perSectionCategory[id];
    let out = listings.filter((l) => l.kind === id);
    if (cat) out = out.filter((l) => l.category === cat);
    if (q) {
      out = out.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.tagline.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q),
      );
    }
    return out;
  };

  const categoriesForSection = (id: SectionId) => {
    const set = new Set<string>();
    for (const l of listings) if (l.kind === id) set.add(l.category);
    return Array.from(set);
  };

  const selectedListing = useMemo(
    () => (item ? listings.find((l) => l.id === item) ?? null : null),
    [item, listings],
  );

  const goItem = (id: string | undefined) =>
    navigate({ search: (prev) => ({ ...prev, item: id }) });

  return (
    <>
      <SidebarToggleBar />
      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
        <div className="mt-8 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <IconSparkles className="size-6 text-amber-400" />
              Marketplace
            </h1>
            <p className="text-sm text-muted-foreground">
              Meine Bots, Unternehmen, Agenten, MCP-Server, Tools und Software
              — alles an einem Ort. Veröffentliche eigene Pakete mit einem
              Klick.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/90 sm:self-auto"
          >
            <IconUpload className="size-4" />
            Veröffentlichen
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-muted-foreground">
          <IconRobot className="size-3.5" />
          <span>
            Deine persönlichen Bots findest du unter{" "}
            <Link
              className="font-semibold text-sky-300 underline-offset-2 hover:underline"
              to="/agents"
            >
              Meine Bots
            </Link>{" "}
            in der Sidebar.
          </span>
        </div>

        {/* Marketplace-Sektionen — Companies / Agents / MCP / Tools / Software. */}
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isCollapsed = collapsed[s.id];
          const list = sectionListings(s.id);
          const cats = categoriesForSection(s.id);
          return (
            <section
              key={s.id}
              className="mt-6 rounded-2xl border border-white/10 bg-white/[0.015] p-4 sm:p-5"
              id={`market-${s.id}`}
            >
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [s.id]: !prev[s.id] }))
                }
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={!isCollapsed}
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-sky-300" />
                  <h2 className="text-[15px] font-semibold tracking-tight">
                    {s.label}
                  </h2>
                  <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/80">
                    {listings.filter((l) => l.kind === s.id).length} verfügbar
                  </span>
                </div>
                <IconChevronDown
                  className={cn(
                    "size-4 text-muted-foreground/60 transition-transform",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </button>
              <p className="mt-1 text-xs text-muted-foreground/80">
                {s.description}
              </p>
              {!isCollapsed ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="search"
                      placeholder={`${s.label} suchen…`}
                      value={perSectionSearch[s.id]}
                      onChange={(e) =>
                        setPerSectionSearch((prev) => ({
                          ...prev,
                          [s.id]: e.target.value,
                        }))
                      }
                      className="h-9 w-full max-w-xs rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-sky-400/50 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        onClick={() =>
                          setPerSectionCategory((prev) => ({
                            ...prev,
                            [s.id]: null,
                          }))
                        }
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                          perSectionCategory[s.id] === null
                            ? "bg-foreground text-background"
                            : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]",
                        )}
                        type="button"
                      >
                        Alle
                      </button>
                      {cats.map((c) => (
                        <button
                          key={c}
                          onClick={() =>
                            setPerSectionCategory((prev) => ({
                              ...prev,
                              [s.id]: c,
                            }))
                          }
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                            perSectionCategory[s.id] === c
                              ? "bg-foreground text-background"
                              : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]",
                          )}
                          type="button"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  {list.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((listing, index) => (
                        <StaggerItem index={index} key={listing.id}>
                          <ListingCard
                            listing={listing}
                            isInstalled={listing.installed}
                            active={selectedListing?.id === listing.id}
                            actionLabel={
                              listing.kind === "software"
                                ? "Download"
                                : listing.installed
                                  ? "Verwalten"
                                  : "Installieren"
                            }
                            actionTone={
                              listing.kind === "software"
                                ? "primary"
                                : listing.installed
                                  ? "danger"
                                  : "primary"
                            }
                            onAction={() => {
                              if (
                                listing.kind === "software" &&
                                listing.download
                              ) {
                                downloadPackage(listing.download);
                              } else if (listing.installed) {
                                uninstall(
                                  listing.id,
                                  activeCompanyId ?? undefined,
                                );
                              } else {
                                install(
                                  listing.id,
                                  activeCompanyId ?? undefined,
                                );
                                goItem(listing.id);
                              }
                            }}
                            onOpen={() => goItem(listing.id)}
                          />
                        </StaggerItem>
                      ))}
                    </div>
                  ) : (
                    <Empty className="mt-3 h-[140px] border border-dashed">
                      <EmptyHeader>
                        <EmptyTitle className="text-muted-foreground">
                          Keine Angebote in dieser Kategorie.
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )}
                </>
              ) : null}
            </section>
          );
        })}
      </div>

      {selectedListing ? (
        <DetailPanel
          listing={selectedListing}
          installed={selectedListing.installed}
          activeCompanyId={activeCompanyId}
          isAutoStart={isAutoStart(selectedListing, activeCompanyId ?? "")}
          onAutoStart={(next) => {
            if (!activeCompanyId) return;
            toggleAutoStart(selectedListing.id, activeCompanyId);
            if (next) install(selectedListing.id, activeCompanyId);
          }}
          onClose={() => goItem(undefined)}
          onInstall={() => {
            install(selectedListing.id, activeCompanyId ?? undefined);
            goItem(undefined);
          }}
          onUninstall={() => {
            uninstall(selectedListing.id, activeCompanyId ?? undefined);
            goItem(undefined);
          }}
          onDownload={() => {
            if (selectedListing.download)
              downloadPackage(selectedListing.download);
          }}
        />
      ) : null}

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublished={(listing) => goItem(listing.id)}
      />
    </>
  );
}

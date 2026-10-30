import {
  IconBuilding,
  IconBuildingStore,
  IconExternalLink,
  IconPlus,
  IconRobot,
} from "@tabler/icons-react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { AgentCard } from "@/components/agents/agent-card";
import { isSectionId } from "@/components/agents/agent-dialog";
import { BotListTransferDialog } from "@/components/agents/bot-list-transfer-dialog";
import { CreateAgentDialog } from "@/components/agents/create-agent-dialog";
import { AssignCompanyButton } from "@/components/companies/assign-company-button";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { StaggerItem } from "@/components/layout/stagger";
import {
  LivePriceChip,
  LivePriceDisclaimer,
} from "@/components/marketplace/live-price-chip";
import {
  MarketplaceSearch,
  RedeemCodeBar,
} from "@/components/marketplace/redeem-bar";
import {
  SellBotPanel,
  SellCompanyPanel,
} from "@/components/marketplace/sell-panels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type AgentProfile,
  agentListQueryOptions,
} from "@/lib/agents/queries";
import { channelListQueryOptions } from "@/lib/channels/queries";
import { useStartChannel } from "@/lib/channels/start";
import type { ConnectCompany } from "@/lib/companies/catalog";
import {
  listCompanies,
  resolveCompanyId,
  subscribeCompanies,
} from "@/lib/companies/store";
import {
  ensureMarketplaceSeed,
  listListings,
  listOwned,
  type MarketplaceListing,
  searchListings,
  subscribeMarketplace,
} from "@/lib/marketplace/store";
import { cn } from "@/lib/utils";

const agentsSearchSchema = z.object({
  new: z.boolean().optional(),
  agent: z.string().optional(),
  tab: z.enum(["mine", "search", "companies"]).optional(),
  /** Register of the detail shell an old link asked for; checked against the shell's own list. */
  section: z.string().optional(),
  browserTab: z.string().optional(),
});

export const Route = createFileRoute("/_authed/_app/agents/")({
  validateSearch: agentsSearchSchema,
  component: MarketplaceScreen,
});

type Tab = "mine" | "search" | "companies";

type CometResult = {
  id: string;
  script: string;
  status: "pending" | "ok" | "error";
  result?: string;
  error?: string;
  at: string;
};

/**
 * Bot marketplace: Meine Bots · Bots suchen · Unternehmen.
 * Affiliate discovery only — checkout / swipe on seller pages; live Mirks
 * prices are read-only; redeem unlocks after an off-app purchase.
 */
function MarketplaceScreen() {
  const { new: isCreating, agent: selectedAgentId, tab: tabParam, section: sectionParam, browserTab } =
    Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<Tab>(tabParam ?? "mine");
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [browserStatus, setBrowserStatus] = useState<{ url: string; title: string } | null>(null);
  const [cometResults, setCometResults] = useState<CometResult[]>([]);
  const [cometBusy, setCometBusy] = useState(false);

  const runCometScript = useCallback(async (script: string) => {
    if (!browserTab || !script.trim()) return;
    setCometBusy(true);
    const optimistic: CometResult = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      script,
      status: "pending",
      at: new Date().toISOString(),
    };
    setCometResults((prev) => [optimistic, ...prev].slice(0, 6));
    try {
      const res = await fetch(
        `http://127.0.0.1:3002/api/browser/${encodeURIComponent(browserTab)}/exec`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script }),
        },
      );
      const data = await res.json().catch(() => ({}));
      setCometResults((prev) =>
        prev.map((r) =>
          r.id === optimistic.id
            ? {
                ...r,
                status: data.ok ? "ok" : "error",
                result: typeof data.result === "string" ? data.result : JSON.stringify(data.result ?? null),
                error: data.error,
              }
            : r,
        ),
      );
    } catch (err) {
      setCometResults((prev) =>
        prev.map((r) =>
          r.id === optimistic.id
            ? { ...r, status: "error", error: err instanceof Error ? err.message : String(err) }
            : r,
        ),
      );
    } finally {
      setCometBusy(false);
    }
  }, [browserTab]);

  // Fetch initial browser status from the automation server
  useEffect(() => {
    if (!browserTab) return;
    fetch("http://127.0.0.1:3002/api/browser/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.url && data.title) setBrowserStatus({ url: data.url, title: data.title });
      })
      .catch(() => {/* automation server not running — fine */});
  }, [browserTab]);

  // Listen for active-tab updates from WPF via chrome.webview.postMessage
  useEffect(() => {
    if (!browserTab) return;
    const wv = (window as any).chrome?.webview;
    if (!wv) return;
    const handler = (event: { data: string }) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "active_tab_url" && msg.url) {
          setBrowserStatus({ url: msg.url, title: "" });
        }
      } catch {}
    };
    wv.addEventListener("message", handler);
    return () => wv.removeEventListener("message", handler);
  }, [browserTab]);

  const {
    data: agents,
    isPending: loadingAgents,
    isError: failed,
  } = useQuery(agentListQueryOptions());
  const channels = useInfiniteQuery(channelListQueryOptions());

  useEffect(() => {
    ensureMarketplaceSeed();
    return subscribeMarketplace(() => setTick((n) => n + 1));
  }, []);

  useEffect(() => {
    if (tabParam) setTab(tabParam);
  }, [tabParam]);

  /*
   * Which company is currently "where the user is coming from". Read on every tick so a tab switch
   * to `/company/foo` (which sets the key) is reflected here, and so a deleted key is reflected
   * as null. The create dialog uses this to assign new bots to the right roster automatically.
   */
  const activeCompanyId = useMemo(
    () =>
      resolveCompanyId(
        typeof window !== "undefined"
          ? window.localStorage.getItem("connect.activeCompanyId")
          : null,
      ),
    [],
  );

  const mine = useMemo(
    () => (agents ?? []).filter((a) => a.mine),
    [agents],
  );

  const owned = useMemo(() => listOwned(), [tick]);
  const listings = useMemo(
    () => (query.trim() ? searchListings(query) : listListings()),
    [query, tick],
  );

  const loading = loadingAgents || (channels.isPending && !channels.data);
  const showCreate = isCreating === true;
  const [showTransfer, setShowTransfer] = useState(false);
  const close = () => navigate({ search: { tab } });

  /*
   * Old links: `?agent=<id>` used to open a dialog here. The Bot now lives on its own route, and a
   * bookmark or marketplace link that still carries the parameter is forwarded there — section
   * included, so a link to a specific register keeps landing on that register.
   */
  useEffect(() => {
    if (!selectedAgentId) return;
    void navigate({
      params: { agentId: selectedAgentId },
      replace: true,
      search: isSectionId(sectionParam) ? { section: sectionParam } : {},
      to: "/agent/$agentId",
    });
  }, [navigate, sectionParam, selectedAgentId]);

  const setTabNav = (next: Tab) => {
    setTab(next);
    void navigate({ search: { tab: next } });
  };

  /*
   * Marketplace → Start.
   *
   * Bots in "Meine Bots" exist without belonging to a company. Starting a chat from here has two
   * consequences the user wants us to ask about: which company should this bot live on, and which
   * channel should the conversation open in. The picker below handles both — a chosen company is
   * recorded in the roster before the channel is created, so the bot appears in the company
   * sidebar on the same visit and not on the next reload.
   */
  const { start, pending: starting } = useStartChannel();
  const [pickCompanyFor, setPickCompanyFor] = useState<{
    agentId: string;
    agentName: string;
  } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const startFromMarketplace = (agentId: string, agentName: string) => {
    /*
     * If the user is on a company workspace (Spark, Flux, ...) we honor it as the destination.
     * Otherwise we open the picker and wait. A bot with no company cannot join a channel under a
     * company it does not belong to without breaking the "one roster" rule later, so the
     * assignment happens here, before the channel is created.
     */
    const target = activeCompanyId;
    if (target) {
      void runStart(agentId, agentName, target);
      return;
    }
    setStartError(null);
    setPickCompanyFor({ agentId, agentName });
  };

  const runStart = async (
    agentId: string,
    _agentName: string,
    companyId: string,
  ) => {
    setStartError(null);
    try {
      await start(agentId, "");
    } catch (err) {
      console.error("[marketplace] channel start failed:", err, {
        agentId,
        companyId,
      });
      setStartError(
        `Chat mit „${_agentName}" konnte nicht gestartet werden. ${
          err instanceof Error ? err.message : ""
        }`.trim(),
      );
    }
  };

  const handlePickCompany = async (companyId: string) => {
    if (!pickCompanyFor) return;
    const { agentId, agentName } = pickCompanyFor;
    setPickCompanyFor(null);
    await runStart(agentId, agentName, companyId);
  };

  return (
    <>
      <SidebarToggleBar />
      {browserTab ? (
        <div className="border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 px-4 pt-2 text-xs">
            <span className="flex items-center gap-1 font-semibold text-violet-400">
              <svg viewBox="0 0 16 16" className="size-3 fill-current" aria-hidden="true">
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="8" cy="8" r="3" fill="currentColor"/>
              </svg>
              Comet
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="truncate font-mono text-muted-foreground">
              {browserStatus?.url ?? "loading…"}
            </span>
            {browserStatus?.title ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="truncate text-muted-foreground">{browserStatus.title}</span>
              </>
            ) : null}
            <span className="ml-auto rounded-full bg-violet-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-violet-300">
              tab: {browserTab}
            </span>
          </div>
          <CometActionBar
            disabled={cometBusy}
            onRun={(script) => void runCometScript(script)}
          />
          <CometResultsList results={cometResults} />
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-2xl px-4 pb-16">
        <div className="mt-12 w-full max-w-2xl">
          <div className="flex w-full flex-row items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Marketplace</h2>
            <Button
              render={(props) => (
                <Link
                  search={{ new: true, tab: "mine" }}
                  to="/agents"
                  {...props}
                />
              )}
              size="sm"
              variant="ghost"
            >
              <IconPlus />
              Neuer Agent
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Nummer eins zum Finden von Bots und Unternehmen. Hier nur lesen und
            weiterleiten — kaufen / swipen auf der Seite des Anbieters
            (Affiliate). Mirks-Kurse live mitlesen, Handel auf Solana /
            Pump.fun.
          </p>

          <div className="mt-4">
            <RedeemCodeBar onRedeemed={() => setTick((n) => n + 1)} />
          </div>

          <div className="mt-5 flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
            {(
              [
                ["mine", "Meine Bots", IconRobot],
                ["search", "Bots suchen", IconBuildingStore],
                ["companies", "Unternehmen", IconBuilding],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition",
                  tab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={id}
                onClick={() => setTabNav(id)}
                type="button"
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {tab === "mine" ? (
            <div className="mt-6 space-y-6">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Deine eigene Bot-Liste — exportiere als JSON oder lade eine
                  Liste aus einem anderen Deployment hier rein.
                </p>
                <Button
                  onClick={() => setShowTransfer(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  JSON übertragen
                </Button>
              </div>
              {owned.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Eingelöst / Besitz
                    <span className="ml-2 font-normal tabular-nums text-muted-foreground/70">
                      {owned.length}
                    </span>
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {owned.map((asset) => (
                      <li
                        className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"
                        key={asset.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {asset.title}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {asset.serial} · {asset.kind}
                          </p>
                        </div>
                        {asset.kind === "bot" ? (
                          <Button
                            onClick={() =>
                              void navigate({
                                params: { agentId: asset.targetId },
                                to: "/agent/$agentId",
                              })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Öffnen
                          </Button>
                        ) : (
                          <Button
                            render={(props) => (
                              <Link
                                params={{ companyId: asset.targetId }}
                                search={{ level: 2, profile: true }}
                                to="/company/$companyId"
                                {...props}
                              />
                            )}
                            size="sm"
                            variant="outline"
                          >
                            Company
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {loading ? (
                <Skeleton className="h-[180px]" />
              ) : mine.length > 0 ? (
                <AgentSection
                  agents={mine}
                  onStart={startFromMarketplace}
                  startBusy={starting}
                />
              ) : failed && agents === undefined ? (
                <Empty className="h-[180px] border border-dashed border-destructive">
                  <EmptyHeader>
                    <EmptyTitle className="text-destructive">
                      Agents konnten nicht geladen werden.
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Empty className="h-[180px] border border-dashed">
                  <EmptyHeader>
                    <EmptyTitle className="text-muted-foreground">
                      Noch keine eigenen Bots — Code einlösen oder neuen
                      erstellen.
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          ) : null}

          {tab === "search" ? (
            <div className="mt-5 space-y-4">
              <MarketplaceSearch onChange={setQuery} value={query} />
              <SellBotPanel
                agents={agents ?? []}
                onPublished={() => setTick((n) => n + 1)}
              />
              <ListingGrid
                empty="Keine Listings. Anbieter tragen Bots ein — Kunden finden sie hier und kaufen per Swipe auf der Anbieter-Seite."
                listings={listings.filter((l) => l.kind === "bot")}
              />
            </div>
          ) : null}

          {tab === "companies" ? (
            <div className="mt-5 space-y-4">
              <MarketplaceSearch onChange={setQuery} value={query} />
              <SellCompanyPanel onPublished={() => setTick((n) => n + 1)} />
              <ListingGrid
                empty="Keine Unternehmen im Katalog. Listen = auffindbar machen; Kauf bleibt beim Anbieter."
                listings={listings.filter((l) => l.kind === "company")}
              />
            </div>
          ) : null}
        </div>
      </div>
      <CreateAgentDialog
        activeCompanyId={activeCompanyId}
        onClose={close}
        onCreated={(agentId) =>
          void navigate({ params: { agentId }, to: "/agent/$agentId" })
        }
        open={showCreate}
      />


      {/*
       * Bot-Liste JSON-Transfer — mounted on the route so any tab can open it without re-mounting
       * the picker and so the agents it operates on stay the page-level query, not a stale copy.
       */}
      <BotListTransferDialog
        agents={mine}
        onClose={() => setShowTransfer(false)}
        open={showTransfer}
      />

      {/*
       * Marketplace → Start picker. Mounted on the route level rather than inside AgentSection
       * so it can survive the re-render the picker triggers without unmounting, and so any "Start"
       * in the page (now or later) goes through the same flow.
       */}
      <StartCompanyPicker
        agentLabel={pickCompanyFor?.agentName ?? ""}
        onCancel={() => setPickCompanyFor(null)}
        onPick={handlePickCompany}
        open={pickCompanyFor !== null}
      />

      {startError ? (
        <p
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive shadow-lg"
          role="alert"
        >
          {startError}
        </p>
      ) : null}
    </>
  );
}

function AgentSection({
  agents,
  onStart,
  startBusy,
}: {
  agents: AgentProfile[];
  /**
   * Start a chat with this bot. When invoked from the Marketplace without an active company,
   * the parent opens a company picker first and only then creates the channel.
   */
  onStart: (agentId: string, agentName: string) => void;
  startBusy: boolean;
}) {
  if (agents.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">Keine Agents.</p>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,144px)] gap-4">
      {agents.map((agent, index) => (
        <StaggerItem index={index} key={agent.id}>
          {/*
           * The card used to be one big link to the agent profile, which left no place to
           * assign it to a company: the only route to a roster was creating the bot from
           * inside a company workspace. Assignment is now a control on the card, outside the
           * link, so clicking it does not also navigate.
           */}
          <div className="flex flex-col gap-1.5">
            <Link
              className="block"
              params={{ agentId: agent.id }}
              to="/agent/$agentId"
            >
              <AgentCard agent={agent} />
            </Link>
            <AssignCompanyButton agentId={agent.id} />
            <Button
              className="mt-0.5"
              disabled={startBusy}
              onClick={() => onStart(agent.id, agent.name)}
              size="sm"
              type="button"
            >
              Start
            </Button>
          </div>
        </StaggerItem>
      ))}
    </div>
  );
}

/**
 * Pick which company a new conversation belongs to.
 *
 * Why this is its own dialog and not just a popover on the button: this picker decides the bot's
 * roster as well as the channel it opens. The roster side-effect has to land before the channel,
 * because a channel under a company whose roster does not yet contain the bot is the same bug we
 * were chasing, with the channel added on top.
 */
function StartCompanyPicker({
  open,
  onPick,
  onCancel,
  agentLabel,
}: {
  open: boolean;
  onPick: (companyId: string) => void;
  onCancel: () => void;
  agentLabel: string;
}) {
  const [companies, setCompanies] = useState<ConnectCompany[]>(() => listCompanies());
  useEffect(() => {
    if (!open) return;
    setCompanies(listCompanies());
    return subscribeCompanies(() => setCompanies(listCompanies()));
  }, [open]);
  if (!open) return null;
  return (
    <Dialog onOpenChange={(next) => !next && onCancel()} open={open}>
      <DialogContent>
        <DialogTitle>Unternehmen auswählen</DialogTitle>
        <DialogBody className="space-y-3 text-sm text-muted-foreground">
          <p>
            Mit welchem Unternehmen willst du den Chat mit „{agentLabel}" starten?
            Der Bot wird der Sidebar dieses Unternehmens hinzugefügt.
          </p>
          {companies.length === 0 ? (
            <p className="text-sm">
              Du hast noch kein Unternehmen angelegt. Lege eines auf der
              Connect-Seite an, dann kannst du Bots zuordnen.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {companies.map((company) => (
                <li key={company.id}>
                  <button
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted"
                    onClick={() => onPick(company.id)}
                    type="button"
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {company.name}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {company.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <div className="flex justify-end gap-2 px-6 pb-6">
          <Button onClick={onCancel} type="button" variant="outline">
            Abbrechen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListingGrid({
  listings,
  empty,
}: {
  listings: MarketplaceListing[];
  empty: string;
}) {
  if (listings.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {listings.map((listing) => (
        <li
          className="rounded-2xl border border-border bg-card p-4"
          key={listing.id}
        >
          <div className="flex gap-3">
            {listing.kind === "bot" ? (
              <AbstractAvatar
                agentId={listing.targetId}
                name={listing.title}
                seed={listing.targetId}
                size={48}
              />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-xs font-bold">
                CO
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="font-semibold">{listing.title}</p>
                <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold uppercase">
                  {listing.offer === "rent" ? "Miete" : "Kauf"}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {listing.serial} · {listing.sellerName}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {listing.description}
              </p>
              {listing.memecoinTicker ? (
                <div className="mt-2 space-y-1">
                  <LivePriceChip
                    marketUrl={listing.memecoinUrl}
                    ticker={listing.memecoinTicker}
                  />
                  <LivePriceDisclaimer />
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">{listing.priceLabel}</span>
                <a
                  className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                  href={listing.sellerUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Zur Anbieter-Seite
                  <IconExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CometActionBar({
  onRun,
  disabled,
}: {
  onRun: (script: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  const presets: { label: string; script: string }[] = [
    {
      label: "Titel",
      script: "document.title",
    },
    {
      label: "Buttons",
      script: "JSON.stringify(Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).slice(0, 20))",
    },
    {
      label: "URL",
      script: "location.href",
    },
  ];

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onRun(trimmed);
    setValue("");
  };

  return (
    <div className="flex flex-col gap-1 px-4 py-2">
      <div className="flex items-stretch gap-1">
        <input
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-violet-400 disabled:opacity-50"
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="JS-Ausdruck im aktiven Tab ausführen (Enter) — z.B. document.title"
          value={value}
        />
        <button
          className="rounded-md bg-violet-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || !value.trim()}
          onClick={submit}
          type="button"
        >
          {disabled ? "läuft…" : "Ausführen"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[10px]">
        <span className="text-muted-foreground">Quick:</span>
        {presets.map((p) => (
          <button
            className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground transition hover:border-violet-400 hover:text-foreground disabled:opacity-50"
            disabled={disabled}
            key={p.label}
            onClick={() => onRun(p.script)}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CometResultsList({ results }: { results: CometResult[] }) {
  if (results.length === 0) return null;
  return (
    <ul className="space-y-1 px-4 pb-3">
      {results.map((r) => (
        <li
          className="rounded-md border border-border bg-background/70 px-2 py-1 font-mono text-[11px]"
          key={r.id}
        >
          <div className="flex items-center gap-2">
            <span
              className={
                r.status === "ok"
                  ? "size-1.5 rounded-full bg-emerald-400"
                  : r.status === "error"
                    ? "size-1.5 rounded-full bg-rose-400"
                    : "size-1.5 animate-pulse rounded-full bg-violet-400"
              }
            />
            <span className="truncate text-muted-foreground">{r.script}</span>
            <span className="ml-auto text-[9px] text-muted-foreground/70">
              {new Date(r.at).toLocaleTimeString()}
            </span>
          </div>
          {r.status === "ok" && r.result ? (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all pl-3 text-foreground/80">
              {r.result}
            </pre>
          ) : null}
          {r.status === "error" && r.error ? (
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all pl-3 text-rose-300">
              {r.error}
            </pre>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

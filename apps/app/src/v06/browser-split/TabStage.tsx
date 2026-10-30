import { IconArrowLeft, IconBrandChrome, IconExternalLink, IconLoader2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { BrowserProfile, ProfileTab } from "@/contracts/v06/browser-profiles";
import { getFlag } from "@/contracts/v06/flags";
import { profilePreviewPath, type UseProfileContentResult } from "./useBrowserProfiles";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/v06/design/EmptyState";

const PREVIEW_REFRESH_MS = 2000;

export type ProfileContentApi = Pick<
  UseProfileContentResult,
  "tabs" | "openTab" | "closeTab"
>;

/**
 * Rechter Bereich: Tab-Leiste mit Live-Preview des aktiven Tabs
 * (CDP-Screencast aus GET /api/v06/browser-profiles/:id/preview, gebracht von A09).
 */
export function TabStage({
  onCreateTab,
  onCloseTab,
  profile,
  tabs,
}: {
  onCreateTab: UseProfileContentResult["openTab"];
  onCloseTab: ProfileContentApi["closeTab"];
  profile: BrowserProfile | null;
  tabs: ProfileTab[];
}) {
  const isDesignV2 = getFlag("designV2");
  const [draftUrl, setDraftUrl] = useState("");
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [previewTick, setPreviewTick] = useState(0);

  // Profilwechsel: Auswahl auf den ersten Tab des Profils zuruecksetzen.
  useEffect(() => {
    setActiveTabId(null);
    setDraftUrl("");
  }, [profile?.id]);

  const activeTab =
    (activeTabId ? tabs.find((t) => t.id === activeTabId) : undefined) ?? tabs[0] ?? null;

  // Live-Preview periodisch nachziehen (Screencast-Frame).
  useEffect(() => {
    if (!activeTab || profile?.status !== "active") return;
    const timer = window.setInterval(() => setPreviewTick((t) => t + 1), PREVIEW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [activeTab?.id, profile?.status]);

  if (!profile) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center transition-colors",
          isDesignV2 ? "bg-[var(--p-surface-1)]" : "bg-muted/30",
        )}
        data-testid="tab-stage-empty"
      >
        {isDesignV2 ? (
          <EmptyState
            compact
            icon={<IconBrandChrome className="size-5 text-[var(--p-accent)]" />}
            title="Kein aktives Browser-Profil"
            description="Lege oben mit „+“ ein Profil an, um Tabs zu starten."
          />
        ) : (
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            Kein aktives Browser-Profil. Lege oben mit „+“ eines an.
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden transition-colors",
        isDesignV2 ? "bg-[var(--p-bg)] text-[var(--p-text-1)]" : "bg-muted/20",
      )}
      data-testid="tab-stage"
    >
      {/* Tab-Leiste */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 py-1.5 transition-colors",
          isDesignV2
            ? "border-b border-[var(--p-border)] bg-[var(--p-surface-1)]"
            : "border-b border-border/40 bg-background/80",
        )}
      >
        {tabs.map((tab) => {
          const active = activeTab?.id === tab.id;
          return (
            <span
              className={cn(
                "group inline-flex h-7 max-w-[180px] shrink-0 items-center gap-1.5 px-3 text-[12px] transition-all duration-[180ms]",
                isDesignV2
                  ? active
                    ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border-strong)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] shadow-[var(--p-shadow-sm)] font-medium"
                    : "rounded-[var(--p-radius-sm)] border border-transparent text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text-1)]"
                  : active
                    ? "rounded-full border border-border bg-background text-foreground shadow-sm"
                    : "rounded-full border border-transparent text-muted-foreground hover:bg-background/60",
              )}
              data-testid="stage-tab"
              key={tab.id}
            >
              <button
                className="min-w-0 truncate"
                data-testid="stage-tab-select"
                onClick={() => setActiveTabId(tab.id)}
                title={tab.url}
                type="button"
              >
                {tab.title || hostOf(tab.url)}
              </button>
              <button
                aria-label="Tab schließen"
                className={cn(
                  "size-4 shrink-0 rounded-full text-[10px] opacity-0 transition-opacity group-hover:opacity-100",
                  isDesignV2
                    ? "text-[var(--p-text-3)] hover:bg-[var(--p-surface-3)] hover:text-[var(--p-text-1)]"
                    : "text-muted-foreground/60 hover:bg-foreground/10 hover:text-foreground",
                )}
                onClick={() => {
                  void onCloseTab(tab.id);
                }}
                type="button"
              >
                ×
              </button>
            </span>
          );
        })}
        <form
          className={cn(
            "flex h-7 min-w-[180px] flex-1 items-center pl-2.5 transition-all",
            isDesignV2
              ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] focus-within:border-[var(--p-border-focus)] shadow-[var(--p-shadow-sm)]"
              : "rounded-full bg-background ring-1 ring-border focus-within:ring-foreground/30",
          )}
          onSubmit={(event) => {
            event.preventDefault();
            const url = draftUrl.trim();
            if (!url) return;
            void onCreateTab(url);
            setDraftUrl("");
          }}
        >
          <input
            className={cn(
              "h-full w-full bg-transparent text-[12px] outline-none",
              isDesignV2
                ? "text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)]"
                : "placeholder:text-muted-foreground/60",
            )}
            data-testid="stage-url-input"
            onChange={(event) => setDraftUrl(event.target.value)}
            placeholder="URL öffnen — Enter"
            value={draftUrl}
          />
        </form>
      </div>

      {/* Live-Preview */}
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden transition-colors",
          isDesignV2 ? "bg-[var(--p-bg)]" : "bg-black",
        )}
        data-testid="tab-stage-preview"
      >
        {activeTab && profile.status === "active" && activeTab.cdpTargetId ? (
          <img
            alt={`Live-Preview ${activeTab.title}`}
            className="h-full w-full object-contain"
            data-testid="browser-live-preview"
            key={`${activeTab.id}:${previewTick}`}
            onError={(event) => {
              (event.target as HTMLImageElement).style.display = "none";
            }}
            src={profilePreviewPath(profile.id, activeTab.cdpTargetId)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            {isDesignV2 ? (
              <EmptyState
                icon={<IconBrandChrome className="size-6 text-[var(--p-accent)]" />}
                title={
                  activeTab
                    ? profile.status === "active"
                      ? "Live-Preview wird initialisiert…"
                      : "Sitzung beendet"
                    : "Keine Tabs offen"
                }
                description={
                  activeTab
                    ? profile.status === "active"
                      ? "Live-Preview startet, sobald der Browser fertig geladen hat."
                      : "Diese Sitzung ist beendet. Tabs werden beim nächsten Start wiederhergestellt."
                    : "Gib oben eine URL ein oder öffne eine Notiz aus der Seitenleiste."
                }
              />
            ) : (
              <>
                <IconBrandChrome className="size-7 text-white/50" />
                <p className="text-[12px] text-white/70">
                  {activeTab
                    ? profile.status === "active"
                      ? "Live-Preview startet, sobald der Browser fertig lädt…"
                      : "Diese Sitzung ist beendet. Tabs werden beim nächsten Start wiederhergestellt."
                    : "Keine Tabs offen — gib oben eine URL ein."}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url.slice(0, 32);
  }
}

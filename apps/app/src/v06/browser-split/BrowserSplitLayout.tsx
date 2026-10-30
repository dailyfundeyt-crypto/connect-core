import { useQuery, type QueryClient } from "@tanstack/react-query";
import { IconAlertTriangle, IconColumns2, IconUser } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { getFlag } from "@/contracts/v06/flags";
import { brainTreeQueryOptions } from "@/lib/brain/queries";
import { cn } from "@/lib/utils";
import { GroupTree } from "./GroupTree";
import { NotePane } from "./NotePane";
import { ProfileTabsBar } from "./ProfileTabsBar";
import { TabStage } from "./TabStage";
import { useBrowserProfiles, useProfileContent } from "./useBrowserProfiles";
import { AddPcAppDialog, PcAppPreview } from "@/v06/pc-apps";
import type { PcAppEntry } from "@/contracts/v06/pc-apps";
import { EmptyState } from "@/v06/design/EmptyState";

/** window-Event, mit dem bestehende Spark-UI eine Notiz rechts öffnen kann. */
export const BROWSER_SPLIT_OPEN_NOTE_EVENT = "connect-v06-browser-split-open-note";

/**
 * Browser-Seite im Comet-Layout: links Steuerung (Profil-Tabs oben,
 * Browser-Gruppen links), rechts Inhalt (geöffnete Tabs mit Live-Preview,
 * Spark-Notiz ggf. rechts neben den Gruppen).
 *
 * Flag-Gate: Ohne `FLAGS_V06.browserSplitLayout` rendert die Komponente
 * `null` — eine bestehende Seite bleibt also unverändert, solange das Flag
 * aus ist. Der Integrator bindet dieses Layout in der Browser-Seite ein
 * (z.B. neben `Level3SiteStudio`) oder nutzt es als Ersatz.
 */
export function BrowserSplitLayout({
  agentId,
  className,
}: {
  agentId: string | null | undefined;
  className?: string;
}) {
  const enabled = getFlag("browserSplitLayout");
  const isDesignV2 = getFlag("designV2");
  const narrow = useAtLeast900px();
  const [mobilePane, setMobilePane] = useState<"groups" | "stage">("stage");

  const profiles = useBrowserProfiles(enabled ? agentId : null);
  const activeProfiles = profiles.activeProfiles;
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const activeProfile =
    activeProfiles.find((p) => p.id === selectedProfileId) ?? activeProfiles[0] ?? null;

  useEffect(() => {
    // Profilwechsel/Ende: Auswahl zurücksetzen, wenn das Profil verschwunden ist.
    if (selectedProfileId && !activeProfiles.some((p) => p.id === selectedProfileId)) {
      setSelectedProfileId(null);
    }
  }, [activeProfiles, selectedProfileId]);

  const content = useProfileContent(enabled ? activeProfile?.id ?? null : null);

  // Spark-Notizen: Liste aus dem Brain (bestehende Datenquelle), rechts geöffnet.
  const notesQuery = useQuery(brainTreeQueryOptions());
  const notes = useMemo(
    () => (notesQuery.data?.available ? notesQuery.data.files.map((f) => f.path) : []),
    [notesQuery.data],
  );
  const [notePath, setNotePath] = useState<string | null>(null);
  const [selectedPcApp, setSelectedPcApp] = useState<PcAppEntry | null>(null);
  const [addPcAppOpen, setAddPcAppOpen] = useState(false);
  const [addPcAppGroupId, setAddPcAppGroupId] = useState<string>("default");

  // Bestehende Spark-UI kann eine Notiz ueber dieses Event in den Pane legen.
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (detail?.path) setNotePath(detail.path);
    };
    window.addEventListener(BROWSER_SPLIT_OPEN_NOTE_EVENT, handler);
    return () => window.removeEventListener(BROWSER_SPLIT_OPEN_NOTE_EVENT, handler);
  }, [enabled]);

  // Profilwechsel lädt neue Daten — offene Notizen schliessen.
  useEffect(() => {
    setNotePath(null);
  }, [activeProfile?.id]);

  if (!enabled) {
    return null;
  }

  if (!agentId) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center p-6 transition-colors",
          isDesignV2 ? "bg-[var(--p-bg)] text-[var(--p-text-1)]" : "",
          className,
        )}
      >
        {isDesignV2 ? (
          <EmptyState
            compact
            icon={<IconUser className="size-6 text-[var(--p-accent)]" />}
            title="Kein Agent gewählt"
            description="Wähle einen Agenten aus, um seine Browser-Sitzung und Notizen zu laden."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Kein Agent gewählt.</p>
        )}
      </div>
    );
  }

  if (profiles.error) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center px-6 transition-colors",
          isDesignV2 ? "bg-[var(--p-bg)] text-[var(--p-text-1)]" : "",
          className,
        )}
      >
        {isDesignV2 ? (
          <div data-testid="browser-split-error">
            <EmptyState
              compact
              icon={<IconAlertTriangle className="size-6 text-[var(--p-danger)]" />}
              title="Browser-Profile nicht erreichbar"
              description={profiles.error}
            />
          </div>
        ) : (
          <p className="max-w-sm text-center text-sm text-muted-foreground" data-testid="browser-split-error">
            Browser-Profile nicht erreichbar: {profiles.error}
          </p>
        )}
      </div>
    );
  }

  const showGroups = narrow || mobilePane === "groups";
  const showStage = narrow || mobilePane === "stage";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden transition-colors",
        isDesignV2 ? "bg-[var(--p-bg)] text-[var(--p-text-1)]" : "bg-background",
        className,
      )}
      data-narrow={narrow ? undefined : "true"}
      data-testid="browser-split-layout"
    >
      {/* Umschalter unter 900px — nur eine Spalte. */}
      {narrow ? null : (
        <div
          className={cn(
            "flex shrink-0 px-3 py-1.5 text-[12px] transition-colors",
            isDesignV2
              ? "border-b border-[var(--p-border)] bg-[var(--p-surface-1)]"
              : "border-b border-border/40 bg-background",
          )}
        >
          <button
            className={cn(
              "px-2.5 py-1 transition-all duration-[180ms]",
              isDesignV2
                ? mobilePane === "groups"
                  ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] shadow-[var(--p-shadow-sm)] font-medium"
                  : "rounded-[var(--p-radius-sm)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                : mobilePane === "groups"
                  ? "rounded-full bg-foreground/[0.06] text-foreground"
                  : "rounded-full text-muted-foreground hover:text-foreground",
            )}
            data-testid="mobile-pane-groups"
            onClick={() => setMobilePane("groups")}
            type="button"
          >
            Gruppen
          </button>
          <button
            className={cn(
              "px-2.5 py-1 transition-all duration-[180ms]",
              isDesignV2
                ? mobilePane === "stage"
                  ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] shadow-[var(--p-shadow-sm)] font-medium"
                  : "rounded-[var(--p-radius-sm)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                : mobilePane === "stage"
                  ? "rounded-full bg-foreground/[0.06] text-foreground"
                  : "rounded-full text-muted-foreground hover:text-foreground",
            )}
            data-testid="mobile-pane-stage"
            onClick={() => setMobilePane("stage")}
            type="button"
          >
            Tabs & Notizen
          </button>
        </div>
      )}

      <ProfileTabsBar
        creating={profiles.loading}
        activeProfileId={activeProfile?.id ?? null}
        onEnd={(profileId) => {
          void profiles.endProfile(profileId);
        }}
        onCreate={(name) => {
          void profiles.createProfile(name);
        }}
        onSelect={(profileId) => {
          setSelectedProfileId(profileId);
          setMobilePane("stage");
        }}
        profiles={activeProfiles}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showGroups ? (
          <div
            className={cn(
              "min-h-0 transition-colors",
              isDesignV2 ? "border-r border-[var(--p-border)]" : "",
              narrow ? "w-full" : "w-72 shrink-0",
            )}
          >
            <GroupTree
              groups={content.groups}
              notes={notes}
              onCreateGroup={(name, parentId) => {
                void content.createGroup(name, parentId);
              }}
              onMoveTab={(tabId, groupId) => {
                void content.moveTab(tabId, groupId);
              }}
              onOpenNote={(path) => {
                setNotePath(path);
                setMobilePane("stage");
              }}
              openNotePath={notePath}
              tabs={content.tabs}
            />
          </div>
        ) : null}

        {showStage ? (
          selectedPcApp ? (
            <PcAppPreview
              app={selectedPcApp}
              onClose={() => setSelectedPcApp(null)}
              className="flex-1"
            />
          ) : notePath ? (
            <NotePane
              files={notes}
              notePath={notePath}
              onBack={() => setNotePath(null)}
              onOpen={(path) => setNotePath(path)}
            />
          ) : (
            <TabStage
              profile={activeProfile}
              tabs={content.tabs}
              onCloseTab={(tabId) => content.closeTab(tabId)}
              onCreateTab={(url) => content.openTab(url)}
            />
          )
        ) : null}
      </div>

      <AddPcAppDialog
        open={addPcAppOpen}
        onOpenChange={setAddPcAppOpen}
        groupId={addPcAppGroupId}
        onAppAdded={(app) => {
          setSelectedPcApp(app);
          setMobilePane("stage");
        }}
      />
    </div>
  );
}

/**
 * Media-Query-Hook: Desktop-Breite >= 900px = zwei Spalten,
 * unter 900px = eine Spalte mit Umschalter.
 */
export function useAtLeast900px(): boolean {
  const [atLeast, setAtLeast] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 900px)").matches
      : true,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 900px)");
    const onChange = (event: MediaQueryListEvent) => setAtLeast(event.matches);
    setAtLeast(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return atLeast;
}

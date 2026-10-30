import {
  IconBrain,
  IconBrandYoutube,
  IconFileText,
  IconFolder,
  IconGitPullRequest,
  IconSchool,
  IconShare,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { BrainActivity } from "@/components/brain/brain-activity";
import { BrainBrowser } from "@/components/brain/brain-browser";
import { BrainGraph } from "@/components/brain/brain-graph";
import { BrainLocationEditor } from "@/components/brain/brain-location-editor";
import { BrainRootSettings } from "@/components/settings/brain-root-settings";
import { SparkLogo } from "@/components/brand/spark-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { brainStatusQueryOptions } from "@/lib/brain/queries";
import { useConnectOnPc } from "@/lib/brain/pc-mode";
import { cn } from "@/lib/utils";
import { AskPanel } from "@/components/brain/learn/ask-panel";
import { ConceptGraph } from "@/components/brain/learn/concept-graph";
import { StudyView } from "@/components/brain/learn/study/study-view";
import { YouTubeImportPanel } from "@/components/brain/learn/youtube-import";
import { ProposalsInbox } from "@/components/brain/learn/proposals-inbox";

const TITLE = "Spark nicht verfügbar";

/*
 * helium-mobilefix: "nicht localhost" hiess frueher automatisch "gehostet/online". Ueber den
 * Handy-Tunnel (*.trycloudflare.com) ist der Server aber der PC – dort gilt der PC-Modus, sobald
 * die Brain-API des PCs antwortet (useConnectOnPc).
 */
export function BrainUnavailable({ reason }: { reason?: string }) {
  const { pc, pending } = useConnectOnPc();
  const hosted = !pc && !pending;
  // The fallback reason repeats the title word for word – show it only when it says something new.
  const detail = reason && reason.trim() && !reason.trim().startsWith(TITLE) ? reason.trim() : null;
  const text = hosted
    ? "Spark liegt auf deinem PC. Öffne Connect über deinen PC, um es hier zu sehen."
    : (detail ?? "Der Spark-Ordner wurde nicht gefunden. Wähle unten den richtigen Ordner.");
  return (
    <div className="flex flex-col gap-6">
      {/*
       * Locally the folder picker comes right after the message: a moved vault or a
       * wrong path is exactly the state in which somebody needs to change the folder.
       * On the hosted version there is no folder to pick, so it stays hidden.
       */}
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center" data-testid="brain-unavailable">
        <SparkLogo size={36} />
        <p className="font-medium">{TITLE}</p>
        <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      </div>
      {hosted || pending ? null : <BrainLocationEditor />}
    </div>
  );
}

type SparkTab = "notizen" | "fragen" | "graph" | "lernen" | "youtube" | "vorschlaege";

const SPARK_TABS: { id: SparkTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "notizen", label: "Notizen", icon: IconFileText },
  { id: "fragen", label: "Fragen", icon: IconSparkles },
  { id: "graph", label: "Graph", icon: IconShare },
  { id: "lernen", label: "Lernen", icon: IconSchool },
  { id: "youtube", label: "YouTube", icon: IconBrandYoutube },
  { id: "vorschlaege", label: "Vorschläge", icon: IconGitPullRequest },
];

export function BrainSettingsPage() {
  const status = useQuery(brainStatusQueryOptions());
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SparkTab>("notizen");
  const [selected, setSelected] = useState("index.md");
  const [locationOpen, setLocationOpen] = useState(false);
  const openFromGraph = useCallback((path: string) => setSelected(path), []);
  if (status.isPending) return <Skeleton className="h-40 w-full" />;
  const data = status.data;
  if (!data?.available) return <BrainUnavailable reason={data && !data.available ? data.reason : undefined} />;

  return (
    <div
      className="relative flex min-h-[calc(100svh-3.5rem)] flex-col overflow-hidden bg-[#f6f5f2] md:h-full md:min-h-0"
      data-testid="brain-settings"
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-black/[0.06] px-4 pr-16 md:pl-6 md:pr-20">
        <div className="flex min-w-0 items-center gap-3">
          <SparkLogo size={32} />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-tight text-[#24231f]">Spark</h1>
            <p className="truncate text-xs text-[#85827b]">
              {data.files.toLocaleString("de-DE")} Notizen{data.vaultFiles ? ` · ${data.vaultFiles.toLocaleString("de-DE")} Vault-Notizen` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <button
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#24231f] px-3 text-xs font-medium text-[#f6f5f2] transition-colors hover:bg-black"
          data-testid="open-brain-page"
          onClick={() => void navigate({ to: "/brain" })}
          type="button"
        >
          <SparkLogo size={16} />
          Spark-Seite (Graph, Routinen, Braucht dich)
        </button>
        <button
          aria-expanded={locationOpen}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-black/[0.08] bg-white/70 px-3 text-xs font-medium text-[#4e4b45] transition-colors hover:bg-white"
          onClick={() => setLocationOpen((open) => !open)}
          type="button"
        >
          <IconFolder className="size-4" stroke={1.7} />
          Datenquelle
        </button>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-1 border-b border-black/[0.06] bg-[#f0eee9] px-4 md:px-6">
        {SPARK_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs transition-colors",
                isActive
                  ? "border-[#24231f] text-[#24231f] font-semibold"
                  : "border-transparent text-[#6e6b65] hover:border-black/20 hover:text-[#24231f]"
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "notizen" && (
        <>
          {/* Agent 3 (Integration): Notiz-Ansicht/Liste (Agent 1 „Spark Brain – Titel umbenennen“)
              angebunden – Baum, Suche, Leseansicht, „Umbenennen“ und „Neue Notiz“ mit Titel. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-6">
            <BrainBrowser
              initialTab="notizen"
              onSelect={setSelected}
              selected={selected}
              showTabs={false}
            />
          </div>

          <details className="shrink-0 border-t border-black/[0.06] bg-[#f6f5f2] px-4 py-2 md:px-6">
            <summary className="cursor-pointer text-xs font-medium text-[#6e6b65] outline-none transition-colors hover:text-[#24231f]">
              Karte
            </summary>
            <div className="pb-3 pt-2">
              <BrainGraph
                className="h-[64vh] min-h-[420px]"
                fullPage
                onOpen={openFromGraph}
                rootLabel={data.vaultPath?.split(/[\\/]/).filter(Boolean).pop() ?? data.path.split(/[\\/]/).filter(Boolean).pop() ?? "Brain"}
                selected={selected}
              />
            </div>
          </details>

          <details className="shrink-0 border-t border-black/[0.06] bg-[#f6f5f2] px-4 py-2 md:px-6">
            <summary className="cursor-pointer text-xs font-medium text-[#6e6b65] outline-none transition-colors hover:text-[#24231f]">
              Letzte Aktivität
            </summary>
            <div className="pb-3 pt-2">
              <BrainActivity limit={25} />
            </div>
          </details>
        </>
      )}

      {activeTab === "fragen" && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <AskPanel onOpenNote={(path) => { setSelected(path); setActiveTab("notizen"); }} />
        </div>
      )}

      {activeTab === "graph" && (
        <div className="relative min-h-0 flex-1">
          <ConceptGraph onOpenNote={(path) => { setSelected(path); setActiveTab("notizen"); }} className="h-full w-full" />
        </div>
      )}

      {activeTab === "lernen" && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <StudyView onOpenNote={(path) => { setSelected(path); setActiveTab("notizen"); }} />
        </div>
      )}

      {activeTab === "youtube" && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <YouTubeImportPanel onOpenNote={(path) => { setSelected(path); setActiveTab("notizen"); }} />
        </div>
      )}

      {activeTab === "vorschlaege" && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <ProposalsInbox />
        </div>
      )}

      {locationOpen ? (
        <div className="absolute top-[4.25rem] right-16 z-30 w-[min(30rem,calc(100vw-5rem))] overflow-hidden rounded-xl border border-black/10 bg-[#fbfaf8] shadow-2xl md:right-20">
          <div className="flex justify-end bg-white/80 px-3 pt-2">
            <button
              aria-label="Datenquelle schließen"
              className="rounded-md p-1 text-[#85827b] hover:bg-black/[0.05] hover:text-[#24231f]"
              onClick={() => setLocationOpen(false)}
              type="button"
            >
              <IconX className="size-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2 p-2">
            {/* Agent 2 (Spark Brain – Daten-Pfad): Speicherort zeigen, prüfen und umstellen (use|copy). */}
            <BrainRootSettings />
            {/* Bestehender Editor: schnuelles Aufalten/Aufschlagen des gewählten Ordners. */}
            <BrainLocationEditor />
          </div>
        </div>
      ) : null}
    </div>
  );
}

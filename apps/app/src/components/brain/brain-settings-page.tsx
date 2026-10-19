import { IconBrain, IconFolder, IconX } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { BrainActivity } from "@/components/brain/brain-activity";
import { BrainGraph } from "@/components/brain/brain-graph";
import { BrainLocationEditor } from "@/components/brain/brain-location-editor";
import { SparkLogo } from "@/components/brand/spark-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { brainStatusQueryOptions } from "@/lib/brain/queries";
import { useConnectOnPc } from "@/lib/brain/pc-mode";

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

export function BrainSettingsPage() {
  const status = useQuery(brainStatusQueryOptions());
  const navigate = useNavigate();
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

      <BrainGraph
        className="min-h-0 flex-1"
        fullPage
        onOpen={openFromGraph}
        rootLabel={data.vaultPath?.split(/[\\/]/).filter(Boolean).pop() ?? data.path.split(/[\\/]/).filter(Boolean).pop() ?? "Brain"}
        selected={selected}
      />

      <details className="shrink-0 border-t border-black/[0.06] bg-[#f6f5f2] px-4 py-2 md:px-6">
        <summary className="cursor-pointer text-xs font-medium text-[#6e6b65] outline-none transition-colors hover:text-[#24231f]">
          Letzte Aktivität
        </summary>
        <div className="pb-3 pt-2">
          <BrainActivity limit={25} />
        </div>
      </details>

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
          <div className="p-2">
            <BrainLocationEditor />
          </div>
        </div>
      ) : null}
    </div>
  );
}

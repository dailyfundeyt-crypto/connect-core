import { IconArrowLeft } from "@tabler/icons-react";
import { getFlag } from "@/contracts/v06/flags";
import { BrainNoteReader } from "@/components/brain/brain-note-reader";
import { cn } from "@/lib/utils";

/**
 * Rechts neben den Gruppen: eine Spark-Notiz, geöffnet — wie bisher im
 * localhost-Viewer, nur im Pane statt im neuen Fenster. Rückweg mit
 * „Zurück“ wieder zur Tab-Ansicht.
 */
export function NotePane({
  files,
  onBack,
  onOpen,
  notePath,
}: {
  files: string[];
  /** Öffnet eine andere Notiz (Backlinks/Klick in der Notiz). */
  onOpen: (path: string) => void;
  onBack: () => void;
  notePath: string;
}) {
  const isDesignV2 = getFlag("designV2");

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden transition-colors",
        isDesignV2 ? "bg-[var(--p-bg)] text-[var(--p-text-1)]" : "bg-background",
      )}
      data-testid="note-pane"
    >
      <button
        className={cn(
          "flex shrink-0 items-center gap-1.5 px-3 py-2 text-[12px] transition-colors",
          isDesignV2
            ? "border-b border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text-1)] font-medium"
            : "border-b border-border/50 text-muted-foreground hover:text-foreground",
        )}
        data-testid="note-pane-back"
        onClick={onBack}
        type="button"
      >
        <IconArrowLeft className="size-3.5" />
        Zurück zu den Tabs
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <BrainNoteReader files={files} onOpen={onOpen} onBack={onBack} path={notePath} />
      </div>
    </div>
  );
}

import { useState } from "react";
import { IconFileText, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface Citation {
  n: number;
  notePath: string;
  heading: string;
  lineStart: number;
  lineEnd?: number;
  url?: string;
  timestamp?: string;
}

export function CitationChip({
  citation,
  onOpen,
  className,
}: {
  citation: Citation;
  onOpen?: (path: string, line?: number) => void;
  className?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const fileName = citation.notePath.split("/").pop()?.replace(/\.md$/i, "") || citation.notePath;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onOpen) {
      onOpen(citation.notePath, citation.lineStart);
    }
  };

  return (
    <span
      className="relative inline-block align-baseline"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.2 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 hover:border-sky-500/50 text-[11px] font-medium transition-colors cursor-pointer select-none",
          className,
        )}
        title={`${citation.notePath} (${citation.heading}) Zeile ${citation.lineStart}`}
      >
        <span className="font-semibold">[{citation.n}]</span>
        <span className="max-w-[120px] truncate opacity-90 hidden sm:inline">{fileName}</span>
      </button>

      {/* Floating Tooltip with citation details */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 min-w-[220px] max-w-[320px] rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-md pointer-events-none animate-in fade-in-50 zoom-in-95">
          <div className="flex items-center gap-1.5 font-medium text-foreground pb-1 border-b">
            <IconFileText className="size-3.5 text-sky-500 shrink-0" />
            <span className="truncate">{fileName}</span>
          </div>
          <div className="mt-1.5 flex flex-col gap-1 text-[11px] text-muted-foreground">
            <div className="truncate flex items-center gap-1">
              <IconChevronRight className="size-3 opacity-60 shrink-0" />
              <span className="font-mono text-[10px] truncate">{citation.notePath}</span>
            </div>
            {citation.heading && (
              <div className="text-foreground/80 italic truncate">
                Abschnitt: {citation.heading}
              </div>
            )}
            <div className="text-sky-600 dark:text-sky-400 font-mono text-[10.5px]">
              Zeile {citation.lineStart}
              {citation.lineEnd && citation.lineEnd !== citation.lineStart ? `–${citation.lineEnd}` : ""}
            </div>
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground/80 italic text-center">
            Klicken, um Notiz an dieser Zeile zu öffnen
          </div>
        </div>
      )}
    </span>
  );
}

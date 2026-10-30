/**
 * T3-Bridge — Tool-Zeile & Tool-Chips im Connect-Look (Lane A22).
 *
 * Rendert Befehlsausgaben, Datei-Operationen, MCP-Tools und Terminal-Aufrufe
 * im bestehenden ToolLine-Design von Connect.
 */

import { type ReactNode, useState } from "react";
import { ToolLine } from "@/components/channels/tool-line";
import { ToolRenderBoundary } from "@/components/channels/tool-boundary";
import type { ConnectChatToolItem } from "@/lib/t3";
import { cn } from "@/lib/utils";
import { Terminal, Check, Copy } from "lucide-react";

/**
 * Zerlegt einen T3-Tool-Titel oder Label in prägnantes Label und Detail.
 * Z. B. "bash: npm test" -> label: "Bash", detail: "npm test"
 */
export function parseToolName(rawTitle: string, rawLabel?: string): { label: string; detail?: string } {
  const combined = rawLabel && rawLabel !== rawTitle ? `${rawLabel}: ${rawTitle}` : rawTitle;
  
  if (combined.includes(":")) {
    const [first, ...rest] = combined.split(":");
    return {
      label: first.trim(),
      detail: rest.join(":").trim() || undefined,
    };
  }

  if (combined.includes(" ")) {
    const [first, ...rest] = combined.split(" ");
    return {
      label: first.trim(),
      detail: rest.join(" ").trim() || undefined,
    };
  }

  return { label: combined.trim() };
}

export type T3ToolLineProps = {
  item: ConnectChatToolItem;
  className?: string;
  defaultExpanded?: boolean;
};

/**
 * T3ToolLine — Vollständige Tool-Zeile für den T3-Verlauf.
 */
export function T3ToolLine({ item, className, defaultExpanded = false }: T3ToolLineProps) {
  const { label, detail } = parseToolName(item.title, item.label);
  const [copied, setCopied] = useState(false);

  const isRunning = item.status === "running" || item.status === "queued";
  const isFailed = item.status === "error";
  const isRefused = item.status === "cancelled";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.output) return;
    navigator.clipboard?.writeText(item.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ToolRenderBoundary name={label}>
      <div className={cn("t3-tool-line-wrapper select-text", className)} data-tool-id={item.id}>
        <ToolLine
          label={label}
          detail={detail}
          running={isRunning}
          failed={isFailed}
          refused={isRefused}
        >
          {item.output ? (
            <div className="relative mt-1 group">
              <pre className="max-h-72 overflow-x-auto rounded bg-muted/60 p-2.5 font-mono text-[11px] leading-relaxed text-foreground select-text whitespace-pre-wrap">
                {item.output}
              </pre>
              <button
                type="button"
                onClick={handleCopy}
                title="Ausgabe kopieren"
                className="absolute right-2 top-2 rounded border border-border/40 bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:text-foreground"
              >
                {copied ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" /> Kopiert
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Copy className="size-3" /> Kopieren
                  </span>
                )}
              </button>
            </div>
          ) : isRunning ? (
            <div className="py-1 text-xs text-muted-foreground italic">
              Befehl läuft…
            </div>
          ) : null}
        </ToolLine>
      </div>
    </ToolRenderBoundary>
  );
}

/**
 * T3ToolChip — Kompakter Inline-Chip für ein Tool/Befehl.
 */
export function T3ToolChip({
  label,
  detail,
  status = "done",
  onClick,
}: {
  label: string;
  detail?: string;
  status?: ConnectChatToolItem["status"];
  onClick?: () => void;
}) {
  const isRunning = status === "running" || status === "queued";
  const isFailed = status === "error";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors",
        onClick && "cursor-pointer hover:bg-muted hover:text-foreground",
        isRunning && "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse",
        isFailed && "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      <Terminal className="size-3 shrink-0" />
      <span className="font-medium text-foreground">{label}</span>
      {detail ? <span className="truncate max-w-[180px] opacity-75">{detail}</span> : null}
    </button>
  );
}

/**
 * T3ToolChipGroup — Zeigt eine Gruppe kompakter Chips horizontal an.
 */
export function T3ToolChipGroup({
  tools,
  onSelectTool,
  className,
}: {
  tools: ConnectChatToolItem[];
  onSelectTool?: (tool: ConnectChatToolItem) => void;
  className?: string;
}) {
  if (tools.length === 0) return null;

  return (
    <div className={cn("my-1.5 flex flex-wrap items-center gap-1.5", className)}>
      {tools.map((tool) => {
        const { label, detail } = parseToolName(tool.title, tool.label);
        return (
          <T3ToolChip
            key={tool.id}
            label={label}
            detail={detail}
            status={tool.status}
            onClick={onSelectTool ? () => onSelectTool(tool) : undefined}
          />
        );
      })}
    </div>
  );
}

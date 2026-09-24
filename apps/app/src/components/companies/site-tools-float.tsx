/**
 * Freely draggable Seite toolbar — Markieren / URL / Aufgabe.
 * Aufgabe opens a dark multi-agent composer (@ + "quotes" red/blue).
 */

import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLasso,
  IconPencil,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { SiteAufgabeField } from "@/components/companies/site-aufgabe-field";
import { FloatingPanel } from "@/components/channels/floating-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureAgentBrowserStarted } from "@/lib/agents/agent-browser";
import { type AgentProfile } from "@/lib/agents/queries";
import { useStartChannel } from "@/lib/channels/start";
import {
  buildSiteTaskPrompt,
  clearSiteMarks,
  getSiteMark,
  setSiteMarking,
  subscribeSiteMark,
} from "@/lib/companies/site-mark";
import { parseSiteTaskAssignments } from "@/lib/companies/site-task-parse";
import { cn } from "@/lib/utils";

export function SiteToolsFloat({
  companyId,
  companyName,
  siteUrl,
  agents,
  marking,
  hasMarks,
  onToggleMark,
  onClearMarks,
  onSaveUrl,
  onBack,
  onForward,
}: {
  companyId: string;
  companyName: string;
  siteUrl: string;
  agents: AgentProfile[];
  marking: boolean;
  hasMarks: boolean;
  onToggleMark: () => void;
  onClearMarks: () => void;
  onSaveUrl: (next: string) => void;
  onBack?: () => void;
  onForward?: () => void;
}) {
  const { startChosen, startQuiet, pending } = useStartChannel();
  const [urlOpen, setUrlOpen] = useState(false);
  const [aufgabeOpen, setAufgabeOpen] = useState(false);
  const [draft, setDraft] = useState(siteUrl);
  const [taskText, setTaskText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(
    () => getSiteMark(companyId).agentId,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!urlOpen) setDraft(siteUrl);
  }, [siteUrl, urlOpen]);

  useEffect(() => {
    if (!urlOpen) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [urlOpen]);

  useEffect(() => {
    const refresh = () => setPrimaryId(getSiteMark(companyId).agentId);
    refresh();
    return subscribeSiteMark(refresh);
  }, [companyId]);

  const save = () => {
    const next = draft.trim();
    if (!next) return;
    onSaveUrl(next);
    setUrlOpen(false);
  };

  const primary =
    agents.find((a) => a.id === primaryId) ?? agents[0] ?? null;

  const agentOptions = agents.map((a) => ({ id: a.id, name: a.name }));

  const submitAufgabe = async () => {
    setError(null);
    const primaryAgentId = primary?.id ?? null;
    const assignments = parseSiteTaskAssignments(
      taskText,
      agentOptions,
      primaryAgentId,
    );
    if (assignments.length === 0) {
      setError(
        primaryAgentId
          ? "Aufgabe schreiben oder @Agent „Auftrag“."
          : "Links einen Agenten wählen oder mit @ erwähnen.",
      );
      return;
    }

    try {
      const multi = assignments.length > 1;
      const nameById = new Map(agents.map((a) => [a.id, a.name]));
      const marks = getSiteMark(companyId).marks;

      // Warm every Chrome / sandbox first (parallel mice).
      for (const asg of assignments) {
        void ensureAgentBrowserStarted(asg.agentId);
      }

      const primaryAsg =
        assignments.find((a) => a.primary) ??
        assignments.find((a) => a.agentId === primaryAgentId) ??
        assignments[0]!;

      const others = assignments.filter((a) => a.agentId !== primaryAsg.agentId);

      await Promise.all(
        others.map(async (asg) => {
          const peers = assignments
            .filter((o) => o.agentId !== asg.agentId)
            .map((o) => nameById.get(o.agentId) ?? o.agentId);
          const prompt = buildSiteTaskPrompt({
            siteUrl,
            companyName,
            marks,
            task: asg.task,
            multiAgent: multi,
            peers,
          });
          await startQuiet(asg.agentId, prompt);
        }),
      );

      const peers = assignments
        .filter((o) => o.agentId !== primaryAsg.agentId)
        .map((o) => nameById.get(o.agentId) ?? o.agentId);
      const prompt = buildSiteTaskPrompt({
        siteUrl,
        companyName,
        marks,
        task: primaryAsg.task,
        multiAgent: multi,
        peers,
      });
      await startChosen(primaryAsg.agentId, prompt);

      setTaskText("");
      setAufgabeOpen(false);
      clearSiteMarks(companyId);
      setSiteMarking(companyId, false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Aufträge konnten nicht gestartet werden.",
      );
    }
  };

  return (
    <FloatingPanel
      className={cn(
        "shadow-md shadow-black/15",
        aufgabeOpen && "border-[#1c1c1e] bg-[#1c1c1e]",
      )}
      defaultPos={() => {
        if (typeof window === "undefined") return { x: 24, y: 24 };
        return {
          x: Math.max(12, window.innerWidth - 360),
          y: 16,
        };
      }}
      hideHeader
      storageKey={`connect.site.tools-float.${companyId}`}
      width={
        aufgabeOpen
          ? "min(26rem, calc(100vw - 1.5rem))"
          : urlOpen
            ? "min(22rem, calc(100vw - 1.5rem))"
            : "auto"
      }
      zIndex={25}
    >
      <div
        className={cn(
          "flex flex-col",
          aufgabeOpen ? "gap-0" : "gap-1.5 p-2",
        )}
      >
        {urlOpen ? (
          <form
            className="flex items-center gap-1.5 px-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Input
              className="h-8 min-w-0 flex-1 border-neutral-200 bg-white font-mono text-[12px] shadow-none"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(siteUrl);
                  setUrlOpen(false);
                }
              }}
              placeholder="https://…"
              ref={inputRef}
              value={draft}
            />
            <Button
              className="size-8 shrink-0 rounded-full"
              disabled={!draft.trim()}
              size="icon"
              title="Speichern"
              type="submit"
            >
              <IconCheck className="size-3.5" />
            </Button>
            <Button
              className="size-8 shrink-0 rounded-full"
              onClick={() => {
                setDraft(siteUrl);
                setUrlOpen(false);
              }}
              size="icon"
              title="Abbrechen"
              type="button"
              variant="outline"
            >
              <IconX className="size-3.5" />
            </Button>
          </form>
        ) : null}

        {aufgabeOpen ? (
          <SiteAufgabeField
            agents={agentOptions}
            error={error}
            onChange={setTaskText}
            onSubmit={() => void submitAufgabe()}
            pending={pending}
            placeholder={
              primary
                ? `Was sollen ${primary.name} und andere tun? @Name \"…\"`
                : 'Aufgabe… @Agent "Auftrag in Anführungszeichen"'
            }
            primaryAgent={
              primary
                ? {
                    id: primary.id,
                    name: primary.name,
                    avatarSeed: primary.avatarSeed,
                  }
                : null
            }
            value={taskText}
          />
        ) : null}

        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5",
            aufgabeOpen
              ? "border-t border-white/10 bg-[#1c1c1e] px-2 py-2"
              : undefined,
          )}
        >
          {onBack || onForward ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border p-0.5",
                aufgabeOpen ? "border-white/15" : "border-border",
              )}
            >
              <Button
                aria-label="Zurück"
                className={cn(
                  "size-7 rounded-full",
                  aufgabeOpen && "text-white/80 hover:bg-white/10 hover:text-white",
                )}
                disabled={!onBack}
                onClick={onBack}
                size="icon"
                title="Zurück · Alt← / ⌘["
                type="button"
                variant="ghost"
              >
                <IconChevronLeft className="size-3.5" />
              </Button>
              <Button
                aria-label="Vorwärts"
                className={cn(
                  "size-7 rounded-full",
                  aufgabeOpen && "text-white/80 hover:bg-white/10 hover:text-white",
                )}
                disabled={!onForward}
                onClick={onForward}
                size="icon"
                title="Vorwärts · Alt→ / ⌘]"
                type="button"
                variant="ghost"
              >
                <IconChevronRight className="size-3.5" />
              </Button>
            </span>
          ) : null}
          <Button
            className={
              marking
                ? "h-8 gap-1.5 rounded-full bg-sky-600 text-white hover:bg-sky-700"
                : cn(
                    "h-8 gap-1.5 rounded-full",
                    aufgabeOpen &&
                      "border-white/20 bg-transparent text-white/90 hover:bg-white/10 hover:text-white",
                  )
            }
            onClick={onToggleMark}
            size="sm"
            title="Bereich auf der Seite markieren"
            type="button"
            variant={marking ? "default" : "outline"}
          >
            <IconLasso className="size-3.5" />
            Markieren
          </Button>
          {hasMarks ? (
            <Button
              className={cn(
                "h-8 gap-1.5 rounded-full",
                aufgabeOpen &&
                  "border-white/20 bg-transparent text-white/90 hover:bg-white/10",
              )}
              onClick={onClearMarks}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconX className="size-3.5" />
              Markierung
            </Button>
          ) : null}
          <Button
            className={cn(
              "h-8 gap-1.5 rounded-full",
              aufgabeOpen &&
                "border-white/20 bg-transparent text-white/90 hover:bg-white/10 hover:text-white",
            )}
            onClick={() => {
              setAufgabeOpen(false);
              setDraft(siteUrl);
              setUrlOpen((open) => !open);
            }}
            size="sm"
            type="button"
            variant={urlOpen ? "default" : "outline"}
          >
            <IconPencil className="size-3.5" />
            URL
          </Button>
          <Button
            className={
              aufgabeOpen
                ? "h-8 gap-1.5 rounded-full bg-white text-black hover:bg-white/90"
                : "h-8 gap-1.5 rounded-full"
            }
            onClick={() => {
              setUrlOpen(false);
              setError(null);
              setAufgabeOpen((open) => !open);
            }}
            size="sm"
            title="Aufgabe an Agenten — @ und Anführungszeichen"
            type="button"
            variant={aufgabeOpen ? "default" : "outline"}
          >
            <IconSparkles className="size-3.5" />
            Aufgabe
          </Button>
        </div>
      </div>
    </FloatingPanel>
  );
}

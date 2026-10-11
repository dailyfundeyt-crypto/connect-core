import {
  IconChevronLeft,
  IconChevronRight,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { Composer, toAgentOptions } from "@/components/channels/composer";
import { Button } from "@/components/ui/button";
import {
  formatSlackHandle,
  getAgentIdentity,
} from "@/lib/agents/agent-identity";
import { getAgentCliDefault } from "@/lib/agents/agent-cli";
import { getAgentModelFamily, familyLabel } from "@/lib/agents/agent-models";
import {
  type AgentProfile,
  agentListQueryOptions,
} from "@/lib/agents/queries";
import { useStartChannel } from "@/lib/channels/start";
import { setActiveLevel } from "@/lib/companies/level";
import { getCompany } from "@/lib/companies/store";
import { cn } from "@/lib/utils";

/**
 * Focus — schnelle Tasks als Overlay über HQ.
 * Schwarzer Scrim (kein Blur/Farbcast) — passt zu Connect Schwarz/Weiß.
 */
export function FocusOverlay({
  companyId,
  initialAgentId,
}: {
  companyId: string;
  initialAgentId?: string;
}) {
  const company = getCompany(companyId);
  const agentsQuery = useQuery(agentListQueryOptions());
  const agents = useMemo(() => {
    if (!company || !agentsQuery.data) return [];
    return company.agentIds
      .map((id) => agentsQuery.data.find((a) => a.id === id))
      .filter((a): a is AgentProfile => Boolean(a));
  }, [company, agentsQuery.data]);

  const { start, pending } = useStartChannel();
  const [error, setError] = useState<string | null>(null);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);

  const index = useMemo(() => {
    if (agents.length === 0) return 0;
    const fromUrl = initialAgentId
      ? agents.findIndex((a) => a.id === initialAgentId)
      : -1;
    return fromUrl >= 0 ? fromUrl : 0;
  }, [agents, initialAgentId]);

  const [activeIndex, setActiveIndex] = useState(index);
  useEffect(() => setActiveIndex(index), [index]);

  const active = agents[activeIndex];

  const close = useCallback(() => {
    setActiveLevel(2);
  }, []);

  const selectIndex = useCallback(
    (next: number, direction?: 1 | -1) => {
      if (agents.length === 0) return;
      const wrapped = ((next % agents.length) + agents.length) % agents.length;
      if (direction) setSlideDir(direction);
      else if (wrapped !== activeIndex) {
        const forward = (wrapped - activeIndex + agents.length) % agents.length;
        const backward =
          (activeIndex - wrapped + agents.length) % agents.length;
        setSlideDir(forward <= backward ? -1 : 1);
      }
      setActiveIndex(wrapped);
    },
    [activeIndex, agents],
  );

  const goLeft = useCallback(
    () => selectIndex(activeIndex - 1, 1),
    [activeIndex, selectIndex],
  );
  const goRight = useCallback(
    () => selectIndex(activeIndex + 1, -1),
    [activeIndex, selectIndex],
  );

  const startTemplate = useCallback(
    async (agentId: string, text: string) => {
      setError(null);
      try {
        await start(agentId, text);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Chat konnte nicht gestartet werden.",
        );
      }
    },
    [start],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.closest("[role='textbox']") ||
          target.closest("[data-slot='select-trigger']"))
      ) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goLeft();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goRight();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, goLeft, goRight]);

  return (
    <div
      aria-label="Focus — schnelle Tasks"
      className="pointer-events-none absolute inset-0 z-40 flex flex-col"
      role="dialog"
    >
      {/* Solid black scrim — no backdrop-blur (blur pulls HQ colors into a blue cast). */}
      <button
        aria-label="Focus schließen"
        className="pointer-events-auto absolute inset-0 bg-black/80 transition-opacity"
        onClick={close}
        type="button"
      />

      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="pointer-events-auto flex items-center justify-end gap-3 px-5 py-4">
          <Button
            aria-label="Schließen"
            className="size-8 rounded-full border border-white/15 bg-white text-black hover:bg-neutral-100"
            onClick={close}
            size="icon"
            type="button"
            variant="outline"
          >
            <IconX className="size-4" />
          </Button>
        </header>

        {agents.length === 0 ? (
          <div className="pointer-events-auto flex flex-1 items-center justify-center px-6">
            <p className="max-w-sm text-center text-sm text-white/55">
              Noch keine Agents — in HQ hinzufügen, dann erscheinen sie hier als
              schnelle Tasks.
            </p>
          </div>
        ) : (
          <>
            <div className="pointer-events-auto flex items-center justify-center gap-2 px-4 py-1">
              <Button
                aria-label="Vorherige Task"
                className="size-8 rounded-full border border-white/15 bg-transparent text-white hover:bg-white/10"
                onClick={goLeft}
                size="icon"
                type="button"
                variant="outline"
              >
                <IconChevronLeft className="size-4" />
              </Button>
              <p className="min-w-40 text-center text-[11px] tabular-nums text-white/45">
                {activeIndex + 1} / {agents.length}
                {active ? ` · ${active.name}` : ""}
              </p>
              <Button
                aria-label="Nächste Task"
                className="size-8 rounded-full border border-white/15 bg-transparent text-white hover:bg-white/10"
                onClick={goRight}
                size="icon"
                type="button"
                variant="outline"
              >
                <IconChevronRight className="size-4" />
              </Button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 pb-36 pt-2 sm:px-12">
              <div className="pointer-events-none relative h-[min(58vh,480px)] w-full max-w-5xl">
                {agents.map((agent, i) => {
                  const offset = i - activeIndex;
                  if (Math.abs(offset) > 2) return null;
                  return (
                    <TaskCard
                      agent={agent}
                      key={agent.id}
                      offset={offset}
                      onActivate={() => selectIndex(i)}
                      onTemplate={(text) => void startTemplate(agent.id, text)}
                      pending={pending}
                      slideDir={slideDir}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}

        {active ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5">
            <div className="pointer-events-auto w-full max-w-2xl">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-none ring-1 ring-black/20">
                <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-1.5">
                  <div className="size-5 shrink-0 overflow-hidden rounded-md">
                    <AbstractAvatar
                      agentId={active.id}
                      name={active.name}
                      seed={active.avatarSeed}
                      size={20}
                    />
                  </div>
                  <span className="truncate text-xs font-medium text-foreground">
                    {active.name}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {familyLabel(getAgentModelFamily(active.id))} ·{" "}
                    {getAgentCliDefault(active.id)}
                  </span>
                  <IconSparkles className="ml-auto size-3.5 text-muted-foreground" />
                </div>
                <div className="px-2 pb-2 pt-1 [&_[data-floating-composer]]:min-h-24 [&_[data-floating-composer]]:border-0 [&_[data-floating-composer]]:bg-transparent">
                  <Composer
                    agentId={active.id}
                    agents={toAgentOptions(agents)}
                    className="w-full"
                    compact
                    floating
                    onSubmit={async (draft) => {
                      await startTemplate(active.id, draft.text);
                    }}
                    pending={pending}
                  />
                </div>
                {error ? (
                  <p className="px-3 pb-2 text-xs text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
              <p className="mt-2 text-center text-[10px] text-white/40">
                ← → Tasks · Esc schließt Focus · HQ bleibt darunter
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TaskCard({
  agent,
  offset,
  onActivate,
  onTemplate,
  pending,
  slideDir,
}: {
  agent: AgentProfile;
  offset: number;
  onActivate: () => void;
  onTemplate: (text: string) => void;
  pending: boolean;
  slideDir: 1 | -1;
}) {
  const identity = getAgentIdentity(agent.id);
  const handle = formatSlackHandle(identity.slackHandle || agent.name);
  const family = familyLabel(getAgentModelFamily(agent.id));
  const focused = offset === 0;
  const abs = Math.abs(offset);

  const xPercent = offset * 58;
  const yPercent = focused ? -48 : -46;
  const scale = focused ? 1 : abs === 1 ? 0.86 : 0.78;
  const opacity = focused ? 1 : abs === 1 ? 0.55 : 0.3;
  const depthBoost = focused ? 0 : slideDir * offset * 4;

  const briefing = `Briefing: Was sind die wichtigsten offenen Punkte für ${agent.name}? Fasse Lage, Risiken und nächste Schritte klar zusammen.`;
  const routine = `Plane eine neue Routine mit ${agent.name}: Ziel, Trigger, Schritte und wann sie laufen soll.`;
  const draft = `Schreib einen Draft für Slack oder E-Mail im Stil von ${agent.name} — kurz, klar, handlungsfähig.`;

  return (
    <div
      aria-current={focused ? "true" : undefined}
      className={cn(
        "pointer-events-auto absolute top-1/2 left-1/2 flex h-full w-[min(94vw,680px)] flex-col overflow-hidden rounded-3xl border text-left will-change-transform",
        focused
          ? "z-20 border-neutral-200 bg-white ring-1 ring-black/10"
          : "z-10 cursor-pointer border-neutral-200 bg-white opacity-90 hover:opacity-100",
      )}
      onClick={() => {
        if (!focused) onActivate();
      }}
      onKeyDown={(event) => {
        if (focused) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      role={focused ? "group" : "button"}
      style={{
        opacity,
        transform: `translate3d(calc(-50% + ${xPercent + depthBoost}%), ${yPercent}%, 0) scale(${scale})`,
        transition:
          "transform 620ms cubic-bezier(0.22, 1, 0.36, 1), opacity 480ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 480ms ease",
      }}
      tabIndex={focused ? undefined : 0}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="size-8 shrink-0 overflow-hidden rounded-xl">
          <AbstractAvatar
            agentId={agent.id}
            name={agent.name}
            seed={agent.avatarSeed}
            size={32}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {agent.name}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {agent.title || family}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {handle}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Schnelle Task
        </p>
        <div className="flex min-h-[9.5rem] flex-1 flex-col justify-center rounded-2xl border border-neutral-200 bg-white px-5 py-5 text-[15px] leading-relaxed text-neutral-900 sm:min-h-[12rem] sm:text-base">
          {agent.roleDescription?.trim() ||
            `${agent.name} — kurze Aufgabe, dann zurück zu HQ.`}
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pb-1">
          <Chip
            disabled={pending || !focused}
            label={`Briefing mit ${agent.name}`}
            onPick={() => onTemplate(briefing)}
          />
          <Chip
            disabled={pending || !focused}
            label="Neue Routine planen"
            onPick={() => onTemplate(routine)}
          />
          <Chip
            disabled={pending || !focused}
            label="Draft für Slack / Mail"
            onPick={() => onTemplate(draft)}
          />
        </div>
      </div>
    </div>
  );
}

function Chip({
  label,
  onPick,
  disabled,
}: {
  label: string;
  onPick: () => void;
  disabled?: boolean;
}) {
  return (
    <span
      aria-disabled={disabled || undefined}
      className={cn(
        "rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 transition-colors",
        disabled
          ? "pointer-events-none opacity-50"
          : "hover:border-neutral-900 hover:bg-neutral-900 hover:text-white",
      )}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onPick();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onPick();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      {label}
    </span>
  );
}

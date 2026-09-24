import { IconChevronLeft, IconChevronRight, IconSparkles } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { Composer, toAgentOptions } from "@/components/channels/composer";
import { Button } from "@/components/ui/button";
import {
  formatSlackHandle,
  getAgentIdentity,
} from "@/lib/agents/agent-identity";
import { getAgentCliDefault } from "@/lib/agents/agent-cli";
import { getAgentModelFamily, familyLabel } from "@/lib/agents/agent-models";
import type { AgentProfile } from "@/lib/agents/queries";
import { useStartChannel } from "@/lib/channels/start";
import { cn } from "@/lib/utils";

/**
 * Level 1 — open creative stage: one focused agent window, neighbors peeking
 * left/right. Arrow keys (← →) walk agent → agent.
 *
 * Direction matches the arrow: → moves the stack to the right (previous index),
 * ← moves it to the left (next index).
 */
export function Level1AgentStage({
  companyId,
  companyName,
  agents,
  initialAgentId,
}: {
  companyId: string;
  companyName: string;
  agents: AgentProfile[];
  initialAgentId?: string;
}) {
  const navigate = useNavigate();
  const { start, pending } = useStartChannel();
  const [error, setError] = useState<string | null>(null);
  /** +1 = stack sliding right, -1 = sliding left — drives exit/enter travel. */
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

  const selectIndex = useCallback(
    (next: number, direction?: 1 | -1) => {
      if (agents.length === 0) return;
      const wrapped = ((next % agents.length) + agents.length) % agents.length;
      if (direction) setSlideDir(direction);
      else if (wrapped !== activeIndex) {
        // Shortest wrap direction for click-on-peek cards
        const forward = (wrapped - activeIndex + agents.length) % agents.length;
        const backward = (activeIndex - wrapped + agents.length) % agents.length;
        setSlideDir(forward <= backward ? -1 : 1);
      }
      setActiveIndex(wrapped);
      const agent = agents[wrapped];
      if (!agent) return;
      void navigate({
        to: "/company/$companyId",
        params: { companyId },
        search: (prev) => ({
          ...prev,
          level: 1,
          agent: agent.id,
          project: undefined,
          profile: undefined,
        }),
        replace: true,
      });
    },
    [activeIndex, agents, companyId, navigate],
  );

  /**
   * Arrow points at the peek card you want: → brings the right neighbor to center,
   * ← brings the left. Deck slides toward the arrow.
   */
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
  }, [goLeft, goRight]);

  if (agents.length === 0) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <StageBackdrop />
        <header className="relative z-10 flex items-center gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-white">
              {companyName}
            </h1>
            <p className="text-xs text-white/50">
              Level 1 — noch keine Agents in dieser Company
            </p>
          </div>
        </header>
        <div className="relative z-10 flex flex-1 items-center justify-center px-6">
          <p className="max-w-sm text-center text-sm text-white/60">
            Wechsle zu Level 2 und füge Agents hinzu — hier erscheinen sie als
            freie Fenster zum Durchschalten mit ← →.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <StageBackdrop />

      <header className="relative z-10 flex items-center gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-white">
            {companyName}
          </h1>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-center gap-2 px-4 py-1">
          <Button
            aria-label="Nach links verschieben"
            className="size-8 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/20"
            onClick={goLeft}
            size="icon"
            type="button"
            variant="outline"
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <p className="min-w-40 text-center text-[11px] tabular-nums text-white/55">
            {activeIndex + 1} / {agents.length}
            {active ? ` · ${active.name}` : ""}
          </p>
          <Button
            aria-label="Nach rechts verschieben"
            className="size-8 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/20"
            onClick={goRight}
            size="icon"
            type="button"
            variant="outline"
          >
            <IconChevronRight className="size-4" />
          </Button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden pl-6 pr-6 pb-32 pt-2 sm:pl-12 sm:pr-12 sm:pb-36">
          <div className="relative h-[min(62vh,520px)] w-full max-w-5xl">
            {agents.map((agent, i) => {
              const offset = i - activeIndex;
              if (Math.abs(offset) > 2) return null;
              return (
                <AgentCreativeWindow
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
      </div>

      {active ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5">
          <div className="pointer-events-auto w-full max-w-2xl">
            <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/[0.08] shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-1.5">
                <div className="size-5 shrink-0 overflow-hidden rounded-md">
                  <AbstractAvatar
                    agentId={active.id}
                    name={active.name}
                    seed={active.avatarSeed}
                    size={20}
                  />
                </div>
                <span className="truncate text-xs font-medium text-white/80">
                  {active.name}
                </span>
                <span className="truncate text-[10px] text-white/45">
                  {familyLabel(getAgentModelFamily(active.id))} ·{" "}
                  {getAgentCliDefault(active.id)}
                </span>
                <IconSparkles className="ml-auto size-3.5 text-white/40" />
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
                <p className="px-3 pb-2 text-xs text-white/70" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <p className="mt-2 text-center text-[10px] text-white/40">
              ← → verschiebt die Fenster · Enter sendet an {active.name}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AgentCreativeWindow({
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

  // Peek neighbors sit farther out so the slide feels like a real deck shuffle.
  const xPercent = offset * 58;
  const yPercent = focused ? -48 : -46;
  const scale = focused ? 1 : abs === 1 ? 0.86 : 0.78;
  const opacity = focused ? 1 : abs === 1 ? 0.5 : 0.28;
  // Slight depth skew so travel reads clearer in the slide direction.
  const depthBoost = focused ? 0 : slideDir * offset * 4;

  const briefing = `Briefing: Was sind die wichtigsten offenen Punkte für ${agent.name}? Fasse Lage, Risiken und nächste Schritte klar zusammen.`;
  const routine = `Plane eine neue Routine mit ${agent.name}: Ziel, Trigger, Schritte und wann sie laufen soll.`;
  const draft = `Schreib einen Draft für Slack oder E-Mail im Stil von ${agent.name} — kurz, klar, handlungsfähig.`;

  return (
    <div
      aria-current={focused ? "true" : undefined}
      className={cn(
        "absolute top-1/2 left-1/2 flex h-full w-[min(94vw,680px)] flex-col overflow-hidden rounded-3xl border text-left will-change-transform",
        focused
          ? "z-20 border-white/25 bg-white/[0.1] shadow-2xl shadow-black/35 backdrop-blur-2xl"
          : "z-10 cursor-pointer border-white/15 bg-white/[0.05] shadow-lg backdrop-blur-xl hover:opacity-90",
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
      <div className="flex shrink-0 items-center gap-2.5 border-b border-white/10 bg-white/[0.04] px-4 py-3">
        <div className="size-8 shrink-0 overflow-hidden rounded-xl">
          <AbstractAvatar
            agentId={agent.id}
            name={agent.name}
            seed={agent.avatarSeed}
            size={32}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {agent.name}
          </p>
          <p className="truncate text-[11px] text-white/50">
            {agent.title || family}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80">
          {handle}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">
          Creative space
        </p>
        <div className="flex min-h-[9.5rem] flex-1 flex-col justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-5 text-[15px] leading-relaxed text-white/90 backdrop-blur-sm sm:min-h-[12rem] sm:text-base">
          {agent.roleDescription?.trim() ||
            `${agent.name} arbeitet hier in einem offenen Fenster — frei für Ideen, Entwürfe und parallele Tasks.`}
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pb-1">
          <SuggestionChip
            disabled={pending || !focused}
            label={`Briefing mit ${agent.name}`}
            onPick={() => onTemplate(briefing)}
          />
          <SuggestionChip
            disabled={pending || !focused}
            label="Neue Routine planen"
            onPick={() => onTemplate(routine)}
          />
          <SuggestionChip
            disabled={pending || !focused}
            label="Draft für Slack / Mail"
            onPick={() => onTemplate(draft)}
          />
        </div>
      </div>

      {!focused ? (
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-black/25" />
      ) : null}
    </div>
  );
}

function SuggestionChip({
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
        "rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs text-white/75 backdrop-blur-sm transition-colors",
        disabled
          ? "pointer-events-none opacity-50"
          : "hover:border-white/30 hover:bg-white/[0.16] hover:text-white",
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

function StageBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[#0a0a0a]" />
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 30%, rgba(255,255,255,0.12), transparent 55%), radial-gradient(ellipse 70% 50% at 80% 70%, rgba(255,255,255,0.08), transparent 50%), radial-gradient(ellipse 50% 40% at 50% 100%, rgba(255,255,255,0.06), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 opacity-40"
        style={{
          background:
            "repeating-linear-gradient(100deg, transparent, transparent 40px, rgba(255,255,255,0.04) 40px, rgba(255,255,255,0.04) 80px)",
          maskImage: "linear-gradient(to top, black, transparent)",
        }}
      />
    </div>
  );
}

import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCrown,
  IconPencil,
  IconPlayerSkipForward,
  IconX,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type FocusChainConfig,
  type FocusChainState,
  type FocusChainStep,
  getChainState,
  getFocusChain,
  openExternal,
  openFocusTab,
  saveChainState,
  sameOriginPath,
  subscribeFocusChain,
} from "@/lib/focus-chain";
import { EXTERNAL_LINKS } from "@connect/contracts";
import { getFlag } from "@/contracts/v06/flags";
import { getFocusCardsV2 } from "@/v06/focus/focusCards";
import { cn } from "@/lib/utils";

export function useFocusChainConfig(): FocusChainConfig {
  const [cfg, setCfg] = useState(() => getFocusChain());
  useEffect(() => subscribeFocusChain(() => setCfg(getFocusChain())), []);
  return cfg;
}

function favicon(url: string): string {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`;
  } catch {
    return "";
  }
}

/** Big-Boss-Logo: eigenes Bild (Einstellungen › Fokus) oder Premium-Platzhalter. */
export function BigBossLogo({ src, size = 168 }: { src?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full p-[3px]"
      style={{
        width: size,
        height: size,
        background: "conic-gradient(from 210deg, #fbbf24, #f472b6, #a78bfa, #38bdf8, #fbbf24)",
        boxShadow: "0 0 80px -10px rgba(251,191,36,0.45), 0 0 140px -30px rgba(167,139,250,0.5)",
      }}
    >
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_25%,#26232f,#09090b_70%)]">
        {src && !broken ? (
          <img alt="Big Boss" className="size-full object-cover" onError={() => setBroken(true)} src={src} />
        ) : (
          <span className="flex flex-col items-center">
            <IconCrown className="text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.55)]" size={size * 0.36} stroke={1.6} />
            <span className="mt-1 font-semibold tracking-[0.32em] text-white/85" style={{ fontSize: Math.max(11, size * 0.075) }}>
              BIG BOSS
            </span>
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Fokus-Kette (helium-focuschain2): ruhige Big-Boss-Startseite, danach die Plan-Apps
 * als große Karten zum Wischen (Pager x/N oben, Pfeile, Antippen öffnet die App).
 * Pro Antippen nur ein Fenster/App (Browser-Regel) → beim Zurückkommen ist der
 * nächste Schritt vorgewählt.
 */
export function FocusChain({
  variant = "inline",
  onClose,
  footer,
  keyboard = false,
}: {
  variant?: "inline" | "fullscreen";
  onClose?: () => void;
  footer?: React.ReactNode;
  /** PC: ← → wechseln den Schritt, Enter öffnet ihn (nicht in Eingabefeldern). */
  keyboard?: boolean;
}) {
  const cfg = useFocusChainConfig();
  const navigate = useNavigate();
  const isFocusV2 = getFlag("focusV2");
  const isDesignV2 = getFlag("designV2");
  const steps = useMemo(() => {
    if (isFocusV2) {
      // Focus v06 (A02): Reihenfolge aus FOCUS_ORDER_V2: plan -> datenbank -> aufgaben -> emails
      // Agenten-Kontakte entfaellt, Aufgaben oeffnet Grok-Bot (konfigurierbar via focus.grokbotTarget)
      return getFocusCardsV2({ googleAccount: cfg.googleAccount }).map((card) => ({
        id: card.id,
        name: card.name,
        task: card.task,
        url: card.url,
        android: card.android,
        ios: card.ios,
        openMode: card.openMode,
        intentStyle: card.intentStyle,
        enabled: card.enabled,
        hint: card.hint,
      }));
    }
    // Flag aus: Altes Verhalten
    return cfg.steps.filter((s) => s.enabled && s.url.trim());
  }, [cfg.steps, cfg.googleAccount, isFocusV2]);
  const [state, setStateRaw] = useState<FocusChainState>(() => getChainState());
  const stateRef = useRef(state);
  const setState = useCallback((next: FocusChainState) => {
    stateRef.current = next;
    setStateRaw(next);
    saveChainState(next);
  }, []);
  const isDone = useCallback(
    (sId: string) =>
      state.done.includes(sId) ||
      (sId === "emails" && state.done.includes("email")) ||
      (sId === "email" && state.done.includes("emails")),
    [state.done],
  );
  const index = Math.min(Math.max(0, state.index), Math.max(0, steps.length - 1));
  const finished = steps.length > 0 && steps.every((s) => isDone(s.id));
  const railRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);

  // Zurück aus der App → geöffneten Schritt abhaken, nächsten vorwählen.
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      const s = stateRef.current;
      if (s.opened == null) return;
      const step = steps[s.opened];
      const done = step && !s.done.includes(step.id) ? [...s.done, step.id] : s.done;
      const next = Math.min(s.opened + 1, steps.length - 1);
      setState({ ...s, opened: null, done, index: next, at: Date.now() });
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("pageshow", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("pageshow", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [setState, steps]);

  // Position einer Karte relativ zur Leiste (unabhängig vom offsetParent).
  const cardLeft = (rail: HTMLDivElement, card: HTMLElement) =>
    rail.scrollLeft + (card.getBoundingClientRect().left - rail.getBoundingClientRect().left) - (rail.clientWidth - card.clientWidth) / 2;

  // Aktive Karte zentrieren (ohne Snap-Kampf: Snap kurz aus, direkt setzen).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.children[index] as HTMLElement | undefined;
    if (!card) return;
    const left = Math.max(0, cardLeft(rail, card));
    if (Math.abs(rail.scrollLeft - left) < 4) return;
    programmatic.current = true;
    rail.style.scrollSnapType = "none";
    rail.scrollTo({ left, behavior: "smooth" });
    const t = window.setTimeout(() => {
      rail.scrollLeft = left;
      rail.style.scrollSnapType = "";
      programmatic.current = false;
    }, 420);
    return () => {
      window.clearTimeout(t);
      rail.style.scrollSnapType = "";
      programmatic.current = false;
    };
  }, [index]);

  const scrollEnd = useRef<number | null>(null);
  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail || programmatic.current) return;
    if (scrollEnd.current) window.clearTimeout(scrollEnd.current);
    // erst nach dem Wischen auswerten, damit die Karte nicht zurückspringt
    scrollEnd.current = window.setTimeout(() => {
      const railRect = rail.getBoundingClientRect();
      const center = railRect.left + railRect.width / 2;
      let best = 0;
      let bestDist = Infinity;
      Array.from(rail.children).forEach((el, i) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - center);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      if (best !== stateRef.current.index) setState({ ...stateRef.current, index: best });
    }, 140);
  };

  const go = (i: number) => setState({ ...stateRef.current, phase: "chain", index: Math.min(Math.max(0, i), steps.length - 1) });

  const openStep = (i: number) => {
    const step = steps[i];
    if (!step) return;
    setState({ ...stateRef.current, phase: "chain", index: i, opened: i });
    openExternal(step, cfg.googleAccount);
  };

  const openBoss = () => {
    const link = cfg.bossLink.trim();
    if (!link) return;
    const path = sameOriginPath(link);
    if (path) void navigate({ to: path as never });
    else openFocusTab(link, "boss");
  };

  const keyRef = useRef<{ go: (i: number) => void; open: (i: number) => void; index: number }>({ go: () => {}, open: () => {}, index: 0 });
  keyRef.current = { go, open: openStep, index };
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.closest("[role='textbox']")))) return;
      const k = keyRef.current;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        k.go(k.index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        k.go(k.index + 1);
      } else if (e.key === "Enter" && (!t || t === document.body)) {
        e.preventDefault();
        k.open(k.index);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard]);

  const startChain = () => setState({ phase: "chain", index: 0, opened: null, at: Date.now(), done: [] });
  const edit = () => void navigate({ to: "/settings", hash: "fokus" } as never);

  const full = variant === "fullscreen";
  const active = steps[index];

  // Stefan 17.10.: kein Big-Boss-Startscreen mehr – die Seite startet direkt in der Kette.
  if (steps.length === 0) {
    return (
      <div className={cn("relative flex flex-col items-center px-6 text-center", full ? "min-h-[100dvh] justify-center" : "pb-2 pt-3")}>
        {full && onClose ? (
          <button aria-label="Schließen" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 active:scale-95" onClick={onClose} type="button">
            <IconX className="size-5" />
          </button>
        ) : null}
        {full ? <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.32em] text-white/35">Fokus</p> : null}
        <button aria-label={`${cfg.bossName} öffnen`} className="rounded-full transition active:scale-95" onClick={openBoss} type="button">
          <BigBossLogo size={full ? 196 : 132} src={cfg.bossLogo || undefined} />
        </button>
        <h2 className={cn("font-semibold tracking-tight text-white", full ? "mt-6 text-[28px]" : "mt-4 text-[24px]")}>{cfg.bossName}</h2>
        <p className="mt-1 text-[14px] text-white/45">Erst denken, dann handeln. Logo antippen öffnet den Bot.</p>
        <button
          className="mt-6 flex h-14 w-full max-w-[340px] items-center justify-center gap-2 rounded-full bg-gradient-to-b from-white to-zinc-200 font-semibold text-[17px] text-black shadow-[0_10px_40px_-10px_rgba(255,255,255,0.35)] transition active:scale-[0.98]"
          disabled={steps.length === 0}
          onClick={startChain}
          type="button"
        >
          Fokus-Kette starten
          <span className="font-normal text-black/50">· {steps.length} Schritte</span>
        </button>
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {steps.map((s, i) => (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[12px] text-white/50" key={s.id}>
              {i + 1}. {s.name}
            </span>
          ))}
        </div>
        <button className="mt-4 flex items-center gap-1 text-[13px] text-white/35 active:text-white/70" onClick={edit} type="button">
          <IconPencil className="size-3.5" /> Reihenfolge & Links bearbeiten
        </button>
        {footer}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", full ? "min-h-[100dvh] pt-[max(0.75rem,env(safe-area-inset-top))]" : "pt-2")}>
      {/* Pager oben: x / N · Name, Pfeile */}
      <div className="flex items-center justify-between gap-2 px-4">
        <span aria-hidden className="size-10" />
        <div className="flex items-center gap-2">
          <button aria-label="Vorheriger Schritt" className={cn("flex size-9 items-center justify-center rounded-full transition-colors duration-180 disabled:opacity-30 cursor-pointer", isDesignV2 ? "border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] active:bg-[var(--p-surface-1)]" : "border border-white/15 text-white active:bg-white/10")} disabled={index === 0} onClick={() => go(index - 1)} type="button">
            <IconChevronLeft className="size-4" />
          </button>
          <p className={cn("min-w-[8.5rem] text-center text-[13px] tabular-nums", isDesignV2 ? "text-[var(--p-text-2)] font-medium" : "text-white/55")} data-testid="focus-chain-pager">
            {index + 1} / {steps.length}
            {active ? ` · ${active.name}` : ""}
          </p>
          <button aria-label="Nächster Schritt" className={cn("flex size-9 items-center justify-center rounded-full transition-colors duration-180 disabled:opacity-30 cursor-pointer", isDesignV2 ? "border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] active:bg-[var(--p-surface-1)]" : "border border-white/15 text-white active:bg-white/10")} disabled={index >= steps.length - 1} onClick={() => go(index + 1)} type="button">
            <IconChevronRight className="size-4" />
          </button>
        </div>
        {full && onClose ? (
          <button aria-label="Schließen" className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 active:scale-95" onClick={onClose} type="button">
            <IconX className="size-5" />
          </button>
        ) : (
          <button aria-label="Bearbeiten" className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 active:scale-95" onClick={edit} type="button">
            <IconPencil className="size-4" />
          </button>
        )}
      </div>
      {/* Fortschritt */}
      <div className="mt-3 flex gap-1.5 px-6">
        {steps.map((s, i) => (
          <span
            className={cn("h-1 flex-1 rounded-full transition-colors duration-180", isDesignV2 ? (isDone(s.id) ? "bg-emerald-500" : i === index ? "bg-[var(--p-accent)]" : "bg-[var(--p-surface-3)]") : (isDone(s.id) ? "bg-emerald-400/80" : i === index ? "bg-white" : "bg-white/12"))}
            key={s.id}
          />
        ))}
      </div>

      {/* Karten zum Wischen */}
      <div
        className="relative mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[7%] pb-2 [overscroll-behavior-x:contain] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={onRailScroll}
        ref={railRef}
      >
        {steps.map((s, i) => {
          const done = isDone(s.id);
          const current = i === index;
          const hint = (s as { hint?: string }).hint;
          return (
            <button
              className={cn(
                "relative flex w-[86%] shrink-0 snap-center flex-col items-start rounded-[30px] border p-6 text-left transition duration-200 active:scale-[0.985] cursor-pointer",
                full ? "min-h-[46vh]" : "min-h-[250px]",
                isDesignV2
                  ? current
                    ? "border-[var(--p-border-strong)] bg-[linear-gradient(160deg,var(--p-surface-2),var(--p-surface-1))] opacity-100 shadow-md"
                    : "border-[var(--p-border)] bg-[var(--p-surface-1)] opacity-65 hover:opacity-90 hover:border-[var(--p-border-strong)]"
                  : current
                    ? "border-white/20 bg-[linear-gradient(160deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02))] opacity-100"
                    : "border-white/[0.07] bg-white/[0.02] opacity-55",
              )}
              data-testid={`focus-chain-card-${s.id}`}
              key={s.id}
              onClick={() => (current ? openStep(i) : go(i))}
              type="button"
            >
              <span className="flex w-full items-center justify-between">
                <span className={cn("flex size-14 items-center justify-center overflow-hidden rounded-2xl border transition-colors", isDesignV2 ? "border-[var(--p-border)] bg-[var(--p-surface-2)]" : "border-white/10 bg-white")}>
                  {favicon(s.url) ? <img alt="" className="size-9" src={favicon(s.url)} /> : null}
                </span>
                <span className={cn("flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] tabular-nums font-medium", done ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : isDesignV2 ? "bg-[var(--p-surface-3)] text-[var(--p-text-2)] border border-[var(--p-border)]" : "bg-white/[0.06] text-white/45")}>
                  {done ? <IconCheck className="size-3.5" /> : null}
                  {done ? "erledigt" : `Schritt ${i + 1}`}
                </span>
              </span>
              <span className="mt-auto w-full min-w-0 pt-8">
                <span className={cn("block hyphens-auto break-words font-semibold text-[clamp(22px,7vw,32px)] leading-tight tracking-tight", isDesignV2 ? "text-[var(--p-text-1)]" : "text-white")} lang="de">{s.name}</span>
                <span className={cn("mt-2 block text-[15px] leading-snug", isDesignV2 ? "text-[var(--p-text-2)]" : "text-white/50")}>{s.task}</span>
                {hint ? (
                  <span
                    className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] text-amber-200"
                    data-testid="grokbot-target-hint"
                    title={hint}
                  >
                    {hint}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Aktionen */}
      <div className="mt-4 flex flex-col items-center gap-2 px-6">
        {finished ? (
          <button className="flex h-14 w-full max-w-[360px] items-center justify-center gap-2 rounded-full bg-emerald-400 font-semibold text-[17px] text-black active:scale-[0.98]" onClick={startChain} type="button">
            <IconCheck className="size-5" /> Kette fertig · von vorn
          </button>
        ) : (
          <button className="flex h-14 w-full max-w-[360px] items-center justify-center gap-2 rounded-full bg-gradient-to-b from-white to-zinc-200 font-semibold text-[17px] text-black shadow-[0_10px_40px_-12px_rgba(255,255,255,0.35)] active:scale-[0.98]" data-testid="focus-chain-next" onClick={() => openStep(index)} type="button">
            Weiter: {active?.name} öffnen
          </button>
        )}
        <div className="flex w-full max-w-[360px] items-center justify-between text-[14px] text-white/45">
          <button className="flex h-10 items-center gap-1 px-2 active:text-white disabled:opacity-30" disabled={index === 0} onClick={() => go(index - 1)} type="button">
            <IconChevronLeft className="size-4" /> Zurück
          </button>
          <button className="flex h-10 items-center gap-1 px-2 active:text-white disabled:opacity-30" disabled={index >= steps.length - 1} onClick={() => go(index + 1)} type="button">
            Überspringen <IconPlayerSkipForward className="size-4" />
          </button>
        </div>
      </div>
      {footer}
    </div>
  );
}

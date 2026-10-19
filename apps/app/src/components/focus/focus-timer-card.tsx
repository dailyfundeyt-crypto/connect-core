import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  FOCUS_TIMER_DEFAULT,
  formatFocusTimer,
  getFocusTimer,
  resetFocusTimer,
  setFocusTimerMinutes,
  subscribeFocusTimer,
  toggleFocusTimer,
} from "@/lib/focus-timer";
import { cn } from "@/lib/utils";

const PRESETS = [15, 25, 45, 60] as const;

export function useFocusTimer() {
  const [state, setState] = useState(() => getFocusTimer());
  useEffect(() => {
    const refresh = () => setState(getFocusTimer());
    const off = subscribeFocusTimer(refresh);
    const id = window.setInterval(refresh, 1000);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, []);
  return state;
}

/**
 * Fokus-Timer im früheren Handy-Aussehen (Ring orange/pink, Presets, Start/Reset),
 * kompakt für das Kalender-Popover (helium-focuschain3). Gleicher Timer wie Sidebar/Notch,
 * läuft weiter, wenn das Popover zu ist.
 */
export function FocusTimerCard({ className }: { className?: string }) {
  const timer = useFocusTimer();
  const total = timer.secondsAtStart ?? Math.max(timer.seconds, FOCUS_TIMER_DEFAULT);
  const progress = total > 0 ? Math.min(1, Math.max(0, timer.seconds / total)) : 0;
  const R = 54;
  const C = 2 * Math.PI * R;
  const active = PRESETS.find((m) => m * 60 === (timer.secondsAtStart ?? timer.seconds));
  return (
    <div
      className={cn("flex items-center gap-4 rounded-[28px] border border-white/10 bg-[#1c1c1e] p-4 text-white shadow-2xl", className)}
      data-testid="focus-timer-card"
    >
      <div className="relative size-[112px] shrink-0">
        <svg aria-hidden className="size-full -rotate-90" viewBox="0 0 128 128">
          <defs>
            <linearGradient id="cm-cal-focus-ring" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" fill="none" r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          <circle
            cx="64"
            cy="64"
            fill="none"
            r={R}
            stroke="url(#cm-cal-focus-ring)"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            strokeLinecap="round"
            strokeWidth="8"
            style={{ transition: "stroke-dashoffset 900ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-semibold text-[26px] tabular-nums tracking-tight text-orange-300">
            {formatFocusTimer(timer.seconds)}
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">
            {timer.running ? "läuft" : timer.seconds === 0 ? "fertig" : "Pause"}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((m) => (
            <button
              className={cn(
                "h-8 rounded-full border text-[12px] font-medium tabular-nums transition active:scale-95",
                active === m ? "border-orange-300/40 bg-orange-400/15 text-orange-200" : "border-white/10 bg-white/[0.04] text-white/70",
              )}
              key={m}
              onClick={() => setFocusTimerMinutes(m, timer.running)}
              type="button"
            >
              {m} min
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 font-semibold text-[13px] text-white shadow-[0_6px_20px_-6px_rgba(251,146,60,0.6)] transition active:scale-95"
            onClick={() => toggleFocusTimer()}
            type="button"
          >
            {timer.running ? <IconPlayerPauseFilled className="size-4" /> : <IconPlayerPlayFilled className="size-4" />}
            {timer.running ? "Pause" : "Start"}
          </button>
          <button
            aria-label="Timer zurücksetzen"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 active:scale-95"
            onClick={() => resetFocusTimer()}
            type="button"
          >
            <IconRefresh className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

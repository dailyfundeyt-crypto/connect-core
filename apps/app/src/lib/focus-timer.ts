/**
 * Focus timer shared by the sidebar user menu and Settings.
 * Persists remaining seconds + running state so the footer readout survives menu close.
 */

const STORAGE_KEY = "connect.focus-timer";
const EVENT = "connect-focus-timer";
export const FOCUS_TIMER_DEFAULT = 25 * 60;

export type FocusTimerState = {
  seconds: number;
  running: boolean;
  /** epoch ms when the current run started (for drift-free ticks) */
  startedAt: number | null;
  /** seconds remaining at startedAt */
  secondsAtStart: number | null;
};

function read(): FocusTimerState {
  if (typeof window === "undefined") {
    return {
      seconds: FOCUS_TIMER_DEFAULT,
      running: false,
      startedAt: null,
      secondsAtStart: null,
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        seconds: FOCUS_TIMER_DEFAULT,
        running: false,
        startedAt: null,
        secondsAtStart: null,
      };
    }
    const parsed = JSON.parse(raw) as Partial<FocusTimerState>;
    return {
      seconds:
        typeof parsed.seconds === "number" && parsed.seconds >= 0
          ? parsed.seconds
          : FOCUS_TIMER_DEFAULT,
      running: Boolean(parsed.running),
      startedAt:
        typeof parsed.startedAt === "number" ? parsed.startedAt : null,
      secondsAtStart:
        typeof parsed.secondsAtStart === "number"
          ? parsed.secondsAtStart
          : null,
    };
  } catch {
    return {
      seconds: FOCUS_TIMER_DEFAULT,
      running: false,
      startedAt: null,
      secondsAtStart: null,
    };
  }
}

function write(next: FocusTimerState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

/** Live remaining seconds (accounts for elapsed wall time while running). */
export function focusTimerRemaining(state: FocusTimerState = read()): number {
  if (
    !state.running ||
    state.startedAt == null ||
    state.secondsAtStart == null
  ) {
    return state.seconds;
  }
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  return Math.max(0, state.secondsAtStart - elapsed);
}

export function getFocusTimer(): FocusTimerState {
  const state = read();
  const remaining = focusTimerRemaining(state);
  if (state.running && remaining === 0) {
    const stopped: FocusTimerState = {
      seconds: 0,
      running: false,
      startedAt: null,
      secondsAtStart: null,
    };
    write(stopped);
    return stopped;
  }
  if (state.running && remaining !== state.seconds) {
    return { ...state, seconds: remaining };
  }
  return state;
}

export function startFocusTimer() {
  const current = getFocusTimer();
  const seconds =
    current.seconds > 0 ? current.seconds : FOCUS_TIMER_DEFAULT;
  write({
    seconds,
    running: true,
    startedAt: Date.now(),
    secondsAtStart: seconds,
  });
}

export function pauseFocusTimer() {
  const current = getFocusTimer();
  write({
    seconds: focusTimerRemaining(current),
    running: false,
    startedAt: null,
    secondsAtStart: null,
  });
}

export function toggleFocusTimer() {
  const current = getFocusTimer();
  if (current.running) pauseFocusTimer();
  else startFocusTimer();
}

export function resetFocusTimer() {
  write({
    seconds: FOCUS_TIMER_DEFAULT,
    running: false,
    startedAt: null,
    secondsAtStart: null,
  });
}

export function formatFocusTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function subscribeFocusTimer(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

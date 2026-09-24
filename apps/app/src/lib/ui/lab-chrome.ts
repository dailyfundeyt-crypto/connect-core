/**
 * Lab / Unternehmen chrome — always full-bleed for Browser + Unternehmen
 * (no SidebarToggleBar, no URL strip). Editing the Firmen-URL is in-pane.
 */

const KEY = "connect.lab-chrome";
const EVENT = "connect-lab-chrome-changed";

export type LabChromeSettings = {
  /**
   * @deprecated Always true for Lab/Unternehmen now — kept for settings sync.
   */
  fullscreen: boolean;
};

const DEFAULTS: LabChromeSettings = {
  fullscreen: true,
};

function read(): LabChromeSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LabChromeSettings>;
    // Prefer stored false only if user explicitly turned it off in older builds;
    // new default is always fullscreen for modes 3/4 in the route.
    return {
      fullscreen:
        typeof parsed.fullscreen === "boolean"
          ? parsed.fullscreen
          : DEFAULTS.fullscreen,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(next: LabChromeSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function getLabChromeSettings(): LabChromeSettings {
  return read();
}

export function setLabChromeFullscreen(fullscreen: boolean): LabChromeSettings {
  const next = { ...read(), fullscreen };
  write(next);
  return next;
}

export function subscribeLabChrome(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

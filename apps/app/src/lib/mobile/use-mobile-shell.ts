import { useSyncExternalStore } from "react";
import { isDesktopApp } from "@/lib/desktop-bridge";

/**
 * Handy-Ansicht (Mobile Shell) für Connect im Browser.
 *
 * Greift NUR, wenn das Fenster schmaler als 768px ist UND es ein Touch-Gerät ist
 * (Handy/Tablet). Ein schmal gezogenes Desktop-Fenster, die Connect Desktop App
 * (WebView2), das Sidebar-Fenster und die Notch behalten das Desktop-Layout.
 *
 * Zum Testen am PC: `?mobile=1` (an) bzw. `?mobile=0` (aus) an die URL hängen;
 * die Wahl bleibt im localStorage (`connect.mobileShell`). Auch dann gilt die
 * 768px-Grenze, das Desktop-Layout bleibt also in breiten Fenstern unverändert.
 */

export const MOBILE_SHELL_MAX_WIDTH = 767;
const WIDTH_QUERY = `(max-width: ${MOBILE_SHELL_MAX_WIDTH}px)`;
const COARSE_QUERY = "(pointer: coarse)";
const STORAGE_KEY = "connect.mobileShell";

function readOverride(): "on" | "off" | null {
  try {
    const param = new URLSearchParams(window.location.search).get("mobile");
    if (param === "1" || param === "0") {
      window.localStorage.setItem(STORAGE_KEY, param === "1" ? "on" : "off");
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "on" || stored === "off" ? stored : null;
  } catch {
    return null;
  }
}

export function computeMobileShell(): boolean {
  if (typeof window === "undefined") return false;
  if (isDesktopApp()) return false;
  // Sidebar-/Main-Rollenfenster der Desktop-App (WPF) nie umbauen.
  if ((window as { __CONNECT_SIDEBAR__?: unknown }).__CONNECT_SIDEBAR__ !== undefined) {
    return false;
  }
  if (!window.matchMedia(WIDTH_QUERY).matches) return false;
  const override = readOverride();
  if (override === "on") return true;
  if (override === "off") return false;
  const touch =
    window.matchMedia(COARSE_QUERY).matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
  return touch;
}

function subscribe(onChange: () => void): () => void {
  const width = window.matchMedia(WIDTH_QUERY);
  const coarse = window.matchMedia(COARSE_QUERY);
  width.addEventListener("change", onChange);
  coarse.addEventListener("change", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    width.removeEventListener("change", onChange);
    coarse.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/** true = Handy-Ansicht anzeigen. */
export function useMobileShell(): boolean {
  return useSyncExternalStore(subscribe, computeMobileShell, () => false);
}

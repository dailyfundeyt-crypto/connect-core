/**
 * Lab preferences — Connect IS the browser (Host-Chrome + Connect profile).
 * Real Chromium + Extensions only when Connect runs on the PC
 * (Connect.exe / START-APP / Tauri). Never pack the product as a website
 * in a normal tab or --app= window.
 */

import { scheduleConnectWorkspacePush } from "@/lib/companies/workspace-sync";
import { isDesktopApp, navigateDesktopBrowser } from "@/lib/desktop-bridge";

const KEY = "connect.lab.prefs";
const EVENT = "connect-lab-prefs-changed";

export const DESKTOP_REQUIRED_MESSAGE =
  "Connect Desktop nötig — Connect ist der Browser (Host-Chrome mit Connect-Profil). Starte Connect.exe oder ./START-APP.sh auf dem PC — nicht als Website im Web-Tab.";

/** Exact start path when Host-Chrome / Bot-Computer cannot launch. */
export const CHROME_START_PATH_HINT =
  "Startpfad Windows: Downloads\\Connect → START-APP.cmd (oder Connect.exe). Stack in WSL: ./START.sh. Linux/mac: ./START.sh + ./START-APP.sh. Kein --app=-Website-Fenster. Bot-Computer :4100 nur Ubuntu-Sandbox.";

export type LabPrefs = {
  /**
   * Open Lab apps in host Google Chrome with a durable Connect profile
   * so Google / site logins survive restarts (iframe cookies do not).
   */
  keepLoggedIn: boolean;
};

export type OpenLabChromeResult = {
  ok: boolean;
  error?: string;
  /** Server could not start host Chrome — user must use Connect Desktop. */
  needsDesktop?: boolean;
};

const DEFAULTS: LabPrefs = {
  keepLoggedIn: true,
};

function read(): LabPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LabPrefs>;
    return {
      keepLoggedIn:
        typeof parsed.keepLoggedIn === "boolean"
          ? parsed.keepLoggedIn
          : DEFAULTS.keepLoggedIn,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(next: LabPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
  scheduleConnectWorkspacePush();
}

export function getLabPrefs(): LabPrefs {
  return read();
}

export function setLabKeepLoggedIn(keepLoggedIn: boolean): LabPrefs {
  const next = { ...read(), keepLoggedIn };
  write(next);
  return next;
}

export function subscribeLabPrefs(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export type OpenLabChromeOpts = {
  /** Per-agent Chrome profile (…/agents/{id}). */
  agentId?: string;
  /**
   * `manus` → dedicated Manus profile (…/agents/{id}/manus), never shared
   * with the general agent profile or other bots (Plan 050).
   */
  profileKind?: "default" | "manus";
};

/** Open URL in Connect’s persistent Chrome profile (cookies / Google stay). */
export async function openLabUrlInChrome(
  url: string,
  opts?: OpenLabChromeOpts,
): Promise<OpenLabChromeResult> {
  const target = url.trim();
  if (!target) return { ok: false, error: "Keine URL." };
  const withProto = withProtocol(target);

  // Wenn wir in Connect Desktop sind: Steuere direkt DIESEN eingebetteten Chromium-Browser!
  if (isDesktopApp()) {
    navigateDesktopBrowser(withProto);
    return { ok: true };
  }

  try {
    const res = await fetch("/api/connect/open-chrome", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: withProto,
        agentId: opts?.agentId?.trim() || undefined,
        profileKind: opts?.profileKind === "manus" ? "manus" : undefined,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      needsDesktop?: boolean;
      detail?: string;
    } | null;
    if (!res.ok || !body?.ok) {
      const serverError = body?.error?.trim();
      const detail = body?.detail?.trim() || "";
      const base =
        serverError ||
        (body?.needsDesktop === false
          ? "Chrome-Start fehlgeschlagen."
          : DESKTOP_REQUIRED_MESSAGE);
      return {
        ok: false,
        needsDesktop: body?.needsDesktop !== false,
        error: detail
          ? `${base} (${detail}) — ${CHROME_START_PATH_HINT}`
          : `${base} — ${CHROME_START_PATH_HINT}`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      needsDesktop: true,
      error: `${DESKTOP_REQUIRED_MESSAGE} — ${CHROME_START_PATH_HINT}`,
    };
  }
}

/**
 * Per-agent browser / computer boot — Chrome profile (default), Ubuntu sandbox,
 * or cloud box. Preferences live in agent-computer.ts.
 */

import {
  type AgentComputerRuntime,
  type AnchorCloudTarget,
  anchorRunningMessage,
  anchorSessionBody,
  anchorStartMessage,
  anchorTargetForPrefs,
  ANCHOR_CLOUD_KEY_HINT,
  getAgentComputerPrefs,
  MANUS_CLOUD_KEY_HINT,
  setAgentComputerPrefs,
} from "@/lib/agents/agent-computer";
import { getAgentApiKeys } from "@/lib/agents/agent-api-keys";
import {
  fetchPhoneHostStatus,
  fetchPhoneScreenshot,
  getAgentPhonePrefs,
} from "@/lib/agents/agent-phone";
import { readScreenshot } from "@/lib/computers/screen";
import { CHROME_START_PATH_HINT } from "@/lib/ui/lab-prefs";
/** @deprecated Prefer AgentComputerRuntime — kept for existing imports. */
export type AgentBrowserMode = AgentComputerRuntime;

export type AgentBrowserSession = {
  mode: AgentBrowserMode;
  status: "idle" | "starting" | "running" | "error";
  /** Set when mode is cloud — which Anchor label started this session. */
  anchorTarget?: AnchorCloudTarget;
  sessionId?: string;
  liveViewUrl?: string;
  cdpUrl?: string;
  message?: string;
  startedAt?: string;
};

const SESSION_KEY = "connect.agent-browser-session";
const EVENT = "connect-agent-browser-changed";

type SessionStore = Record<string, AgentBrowserSession>;

function readSessions(): SessionStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SessionStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessions(store: SessionStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(EVENT));
}

export function getAgentBrowserMode(agentId: string): AgentBrowserMode {
  return getAgentComputerPrefs(agentId).runtime;
}

export function setAgentBrowserMode(
  agentId: string,
  mode: AgentBrowserMode,
  cloudTarget?: AnchorCloudTarget,
): AgentBrowserMode {
  const prev = getAgentComputerPrefs(agentId);
  const next = setAgentComputerPrefs(agentId, {
    runtime: mode,
    ...(cloudTarget ? { cloudTarget } : {}),
  });
  const targetChanged =
    mode === "cloud" &&
    anchorTargetForPrefs(prev) !== anchorTargetForPrefs(next);
  if (prev.runtime !== next.runtime || targetChanged) {
    patchSession(agentId, {
      mode: next.runtime,
      anchorTarget: next.runtime === "cloud" ? anchorTargetForPrefs(next) : undefined,
      status: "idle",
      message: undefined,
      liveViewUrl: undefined,
      cdpUrl: undefined,
      sessionId: undefined,
    });
  }
  return next.runtime;
}

export function getAgentBrowserSession(agentId: string): AgentBrowserSession {
  return (
    readSessions()[agentId] ?? {
      mode: getAgentBrowserMode(agentId),
      status: "idle",
    }
  );
}

function patchSession(
  agentId: string,
  patch: Partial<AgentBrowserSession>,
): AgentBrowserSession {
  const store = readSessions();
  const next: AgentBrowserSession = {
    ...getAgentBrowserSession(agentId),
    ...patch,
  };
  store[agentId] = next;
  writeSessions(store);
  return next;
}

/** Start (or reuse) the computer for this agent according to its runtime. */
export async function ensureAgentBrowserStarted(
  agentId: string,
): Promise<AgentBrowserSession> {
  const prefs = getAgentComputerPrefs(agentId);
  const mode = prefs.runtime;
  const anchorTarget = mode === "cloud" ? anchorTargetForPrefs(prefs) : undefined;
  const current = getAgentBrowserSession(agentId);
  const sameAnchor =
    mode !== "cloud" || current.anchorTarget === anchorTarget;
  if (
    current.status === "running" &&
    current.mode === mode &&
    sameAnchor &&
    (mode === "chrome" ||
      mode === "local" ||
      mode === "phone" ||
      mode === "manus" ||
      current.liveViewUrl)
  ) {
    return current;
  }
  if (
    current.status === "starting" &&
    current.mode === mode &&
    sameAnchor
  ) {
    return current;
  }

  const startingMsg =
    mode === "chrome"
      ? "Chrome-Profil wird vorbereitet…"
      : mode === "manus"
        ? "Manus Cloud — dediziertes Profil + task_url…"
        : mode === "cloud"
          ? anchorStartMessage(anchorTarget ?? "azure")
          : mode === "phone"
            ? "Smartphone wird über ADB/scrcpy verbunden…"
            : "Ubuntu-Sandbox lokal startet…";

  patchSession(agentId, {
    mode,
    anchorTarget,
    status: "starting",
    message: startingMsg,
    liveViewUrl: undefined,
    cdpUrl: undefined,
    sessionId: undefined,
  });

  if (mode === "phone") {
    const phone = getAgentPhonePrefs(agentId);
    const host = await fetchPhoneHostStatus();
    if (!host.adb) {
      return patchSession(agentId, {
        mode: "phone",
        status: "error",
        message:
          host.message?.trim() ||
          "ADB fehlt — Platform-Tools installieren und Connect Desktop starten.",
      });
    }
    const online = host.devices.filter((d) => d.state === "device");
    if (online.length === 0) {
      return patchSession(agentId, {
        mode: "phone",
        status: "error",
        message:
          "Kein Android verbunden. USB-Debugging an, oder Wi‑Fi-ADB (IP:5555) unter Monitor koppeln.",
      });
    }
    const serial =
      phone.serial && online.some((d) => d.serial === phone.serial)
        ? phone.serial
        : online[0]?.serial;
    if (!serial) {
      return patchSession(agentId, {
        mode: "phone",
        status: "error",
        message: "Kein Gerät mit Status „device“.",
      });
    }
    const shot = await fetchPhoneScreenshot(serial);
    if (shot.error && !shot.dataUrl) {
      return patchSession(agentId, {
        mode: "phone",
        status: "error",
        message: shot.error,
        sessionId: serial,
      });
    }
    const device = online.find((d) => d.serial === serial);
    const label =
      phone.label ||
      device?.model ||
      device?.product ||
      serial;
    return patchSession(agentId, {
      mode: "phone",
      status: "running",
      sessionId: serial,
      liveViewUrl: shot.dataUrl,
      message: host.scrcpy
        ? `Smartphone bereit (${label}) — scrcpy + ADB.`
        : `Smartphone bereit (${label}) — ADB (scrcpy optional für schnellere Steuerung).`,
      startedAt: new Date().toISOString(),
    });
  }

  if (mode === "chrome" || mode === "manus") {
    const profileKind = mode === "manus" ? "manus" : "default";
    // Manus Cloud: warm dedicated profile; prefer existing task watch URL.
    let openUrl = "about:blank";
    if (mode === "manus") {
      const { getAgentManusApiKey } = await import(
        "@/lib/agents/agent-api-keys"
      );
      if (!getAgentManusApiKey(agentId)) {
        return patchSession(agentId, {
          mode: "manus",
          status: "error",
          message: MANUS_CLOUD_KEY_HINT,
        });
      }
      const { getManusTaskRecord } = await import("@/lib/agents/manus-api");
      const record = getManusTaskRecord(agentId);
      openUrl =
        record?.watchUrl?.trim() ||
        record?.taskUrl?.trim() ||
        "https://manus.im";
    }
    const { isDesktopApp, navigateDesktopBrowser, notifyDesktopLevel } =
      await import("@/lib/desktop-bridge");
    if (isDesktopApp()) {
      const target =
        openUrl && openUrl !== "about:blank"
          ? openUrl
          : "https://www.google.com";
      navigateDesktopBrowser(target);
      notifyDesktopLevel(3);
      return patchSession(agentId, {
        mode,
        status: "running",
        liveViewUrl: target,
        message: "Connect Browser wird direkt von diesem Agenten gesteuert.",
      });
    }
    try {
      const res = await fetch("/api/connect/open-chrome", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: openUrl,
          agentId,
          profileKind,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        needsDesktop?: boolean;
        profile?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        const detail =
          body?.error?.trim() ||
          (mode === "manus"
            ? "Manus-Profil nicht erreichbar — Connect Desktop nötig."
            : "Chrome-Profil nicht erreichbar — Connect Desktop nötig, oder Sandbox wählen.");
        return patchSession(agentId, {
          mode,
          status: "error",
          message: `${detail} — ${CHROME_START_PATH_HINT}`,
        });
      }
      return patchSession(agentId, {
        mode,
        status: "running",
        liveViewUrl: mode === "manus" && openUrl !== "about:blank" ? openUrl : undefined,
        message:
          mode === "manus"
            ? `Manus Cloud bereit${body.profile ? ` · Profil ${body.profile}` : ""} — Watch über task_url in Voll-Chrome.`
            : `Chrome-Profil bereit${body.profile ? ` (${body.profile})` : ""}.`,
        startedAt: new Date().toISOString(),
      });
    } catch {
      return patchSession(agentId, {
        mode,
        status: "error",
        message:
          mode === "manus"
            ? `Manus-Profil nicht erreichbar — Connect Desktop prüfen. — ${CHROME_START_PATH_HINT}`
            : `Chrome-Profil nicht erreichbar — Connect Desktop oder Sandbox lokal/Azure nutzen. — ${CHROME_START_PATH_HINT}`,
      });
    }
  }

  if (mode === "local") {
    const { frame, error } = await readScreenshot(agentId);
    if (!frame) {
      return patchSession(agentId, {
        mode: "local",
        status: "error",
        message:
          error?.trim() ||
          "Ubuntu-Sandbox nicht erreichbar. Supervisor/Computer prüfen.",
      });
    }
    return patchSession(agentId, {
      mode: "local",
      status: "running",
      message:
        prefs.boxSize === "large"
          ? "Ubuntu-Sandbox lokal läuft."
          : "Ubuntu-Sandbox lokal läuft (Docker).",
      startedAt: new Date().toISOString(),
    });
  }

  // Default / Azure / Oracle — one Anchor remote-box. Oracle sends boxSize large.
  const apiKey = getAgentApiKeys(agentId).browserUse.trim();
  const target = anchorTarget ?? "azure";
  if (!apiKey) {
    return patchSession(agentId, {
      mode: "cloud",
      anchorTarget: target,
      status: "error",
      message: ANCHOR_CLOUD_KEY_HINT,
    });
  }

  try {
    const response = await fetch("/api/anchor/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anchor-api-key": apiKey,
      },
      body: JSON.stringify(anchorSessionBody(prefs)),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        text.trim() || `Anchor antwortete mit ${response.status}`,
      );
    }
    const payload = (await response.json()) as {
      data?: {
        id?: string;
        cdp_url?: string;
        live_view_url?: string;
      };
      id?: string;
      cdp_url?: string;
      live_view_url?: string;
    };
    const data = payload.data ?? payload;
    const liveViewUrl =
      typeof data.live_view_url === "string" ? data.live_view_url : undefined;
    const sessionId = typeof data.id === "string" ? data.id : undefined;
    const cdpUrl = typeof data.cdp_url === "string" ? data.cdp_url : undefined;
    if (!liveViewUrl && !sessionId) {
      throw new Error("Anchor lieferte keine Session-URL.");
    }
    return patchSession(agentId, {
      mode: "cloud",
      anchorTarget: target,
      status: "running",
      sessionId,
      liveViewUrl,
      cdpUrl,
      message: anchorRunningMessage(target),
      startedAt: new Date().toISOString(),
    });
  } catch (caught) {
    return patchSession(agentId, {
      mode: "cloud",
      anchorTarget: target,
      status: "error",
      message:
        caught instanceof Error
          ? caught.message
          : `${target === "oracle" ? "Oracle" : target === "default" ? "Default" : "Azure"} Cloud konnte nicht starten.`,
    });
  }
}

export function stopAgentBrowser(agentId: string): AgentBrowserSession {
  return patchSession(agentId, {
    mode: getAgentBrowserMode(agentId),
    status: "idle",
    message: "Computer gestoppt.",
    liveViewUrl: undefined,
    cdpUrl: undefined,
    sessionId: undefined,
  });
}

export function subscribeAgentBrowser(cb: () => void) {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  window.addEventListener("connect-agent-computer-changed", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
    window.removeEventListener("connect-agent-computer-changed", handler);
  };
}

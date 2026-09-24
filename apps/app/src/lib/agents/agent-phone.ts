/**
 * Per-agent Android phone pairing — USB/Wi‑Fi ADB + scrcpy mirror.
 * Open-source stack: Android Platform Tools (adb) + Genymobile/scrcpy.
 * Agents drive phones so YouTube / Instagram see real device fingerprints,
 * not the shared PC Chrome profile.
 */

export type PhoneDevice = {
  serial: string;
  state: string;
  model?: string;
  product?: string;
  transportId?: string;
};

export type AgentPhonePrefs = {
  /** ADB serial of the bound device (USB or `ip:port` for Wi‑Fi). */
  serial: string | null;
  /** Friendly label shown in the Computer menu / watch pane. */
  label: string;
};

const KEY = "connect.agent.phone";
const EVENT = "connect-agent-phone-changed";

type Store = Record<string, AgentPhonePrefs>;

const DEFAULTS: AgentPhonePrefs = {
  serial: null,
  label: "",
};

function readAll(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
}

function normalize(raw: Partial<AgentPhonePrefs> | undefined): AgentPhonePrefs {
  return {
    serial:
      typeof raw?.serial === "string" && raw.serial.trim()
        ? raw.serial.trim()
        : null,
    label: typeof raw?.label === "string" ? raw.label.trim() : "",
  };
}

export function getAgentPhonePrefs(agentId: string): AgentPhonePrefs {
  return normalize(readAll()[agentId]);
}

export function setAgentPhonePrefs(
  agentId: string,
  patch: Partial<AgentPhonePrefs>,
): AgentPhonePrefs {
  const next = normalize({ ...getAgentPhonePrefs(agentId), ...patch });
  const all = readAll();
  all[agentId] = next;
  writeAll(all);
  return next;
}

export function subscribeAgentPhone(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export type PhoneHostStatus = {
  ok: boolean;
  adb: boolean;
  scrcpy: boolean;
  adbVersion?: string;
  scrcpyVersion?: string;
  devices: PhoneDevice[];
  message?: string;
};

/** Probe host for adb/scrcpy and list connected devices. */
export async function fetchPhoneHostStatus(): Promise<PhoneHostStatus> {
  try {
    const res = await fetch("/api/connect/phone/status", {
      credentials: "include",
    });
    const body = (await res.json().catch(() => null)) as PhoneHostStatus | null;
    if (!res.ok || !body) {
      return {
        ok: false,
        adb: false,
        scrcpy: false,
        devices: [],
        message:
          body && "message" in body && typeof body.message === "string"
            ? body.message
            : `Phone-Host nicht erreichbar (${res.status}). Connect Desktop nötig.`,
      };
    }
    return body;
  } catch {
    return {
      ok: false,
      adb: false,
      scrcpy: false,
      devices: [],
      message:
        "Phone-Host nicht erreichbar — Connect Desktop mit ADB/scrcpy starten.",
    };
  }
}

/** Latest screencap from the bound (or first) device, as a data URL. */
export async function fetchPhoneScreenshot(
  serial?: string | null,
): Promise<{ dataUrl?: string; error?: string; serial?: string }> {
  try {
    const qs = serial ? `?serial=${encodeURIComponent(serial)}` : "";
    const res = await fetch(`/api/connect/phone/screenshot${qs}`, {
      credentials: "include",
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      dataUrl?: string;
      serial?: string;
      error?: string;
    } | null;
    if (!res.ok || !body?.ok || !body.dataUrl) {
      return {
        error:
          body?.error?.trim() ||
          `Screenshot fehlgeschlagen (${res.status}). USB-Debugging prüfen.`,
      };
    }
    return { dataUrl: body.dataUrl, serial: body.serial };
  } catch {
    return {
      error: "Screenshot nicht erreichbar — Connect Desktop / ADB prüfen.",
    };
  }
}

/** Connect a device over Wi‑Fi ADB (`adb connect host:port`). */
export async function connectPhoneWifi(
  hostPort: string,
): Promise<{ ok: boolean; message: string; serial?: string }> {
  const trimmed = hostPort.trim();
  if (!trimmed) {
    return { ok: false, message: "IP:Port fehlt (z. B. 192.168.1.20:5555)." };
  }
  try {
    const res = await fetch("/api/connect/phone/connect", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: trimmed }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      serial?: string;
    } | null;
    return {
      ok: Boolean(body?.ok),
      message:
        body?.message?.trim() ||
        (res.ok ? "Verbunden." : `Verbindung fehlgeschlagen (${res.status}).`),
      serial: body?.serial,
    };
  } catch {
    return {
      ok: false,
      message: "Wi‑Fi-ADB nicht erreichbar — Connect Desktop prüfen.",
    };
  }
}

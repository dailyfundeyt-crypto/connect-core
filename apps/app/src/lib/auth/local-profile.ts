/**
 * Display profile for the sidebar user menu — name + avatar.
 * Cached in localStorage; durable copy lives in Postgres via workspace sync
 * (`connect.local-profile` + `/api/connect/media` for the photo).
 */

import {
  persistConnectDataUrl,
  scheduleConnectWorkspacePush,
} from "@/lib/companies/workspace-sync";

export type LocalProfile = {
  name: string;
  /** Durable `/api/connect/media/…` URL or temporary data URL while uploading */
  avatarUrl?: string;
};

const KEY = "connect.local-profile";

const DEFAULT: LocalProfile = {
  name: "Stefan Kunc",
};

export function getLocalProfile(): LocalProfile {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    return {
      name:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : DEFAULT.name,
      ...(typeof parsed.avatarUrl === "string" && parsed.avatarUrl
        ? { avatarUrl: parsed.avatarUrl }
        : {}),
    };
  } catch {
    return DEFAULT;
  }
}

function writeLocal(profile: LocalProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event("connect-local-profile-changed"));
  scheduleConnectWorkspacePush();
}

/**
 * Save name + photo. Data-URL avatars are uploaded to Postgres media storage
 * so they survive across browsers on the same database.
 */
export async function setLocalProfile(input: {
  name: string;
  avatarUrl?: string | null;
}): Promise<LocalProfile> {
  const name = input.name.trim() || DEFAULT.name;
  const next: LocalProfile = { name };

  if (input.avatarUrl) {
    let url = input.avatarUrl;
    if (url.startsWith("data:")) {
      url = await persistConnectDataUrl(url, "user-profile-avatar");
    }
    next.avatarUrl = url;
  }

  writeLocal(next);
  return next;
}

export function subscribeLocalProfile(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-local-profile-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-local-profile-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

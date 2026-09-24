/**
 * Deployment mode: local (data stays on-prem) vs full cloud (hosted Supabase).
 * Companies that must not put data on the public internet stay on Local.
 */

export type DeploymentMode = "local" | "cloud";

export type DeploymentModeState = {
  mode: DeploymentMode;
  cloudUrl?: string;
};

const EVENT = "connect-deployment-mode-changed";

export async function fetchDeploymentMode(): Promise<DeploymentModeState> {
  try {
    const { tryClient } = await import("@/lib/client");
    const response = await tryClient("/api/connect/deployment-mode");
    if (!response.ok) return { mode: "local" };
    const body = (await response.json()) as {
      mode?: string;
      cloudUrl?: string;
    };
    return {
      mode: body.mode === "cloud" ? "cloud" : "local",
      cloudUrl:
        typeof body.cloudUrl === "string" ? body.cloudUrl.trim() : undefined,
    };
  } catch {
    return { mode: "local" };
  }
}

export async function saveDeploymentMode(
  next: DeploymentModeState,
): Promise<DeploymentModeState> {
  const { tryClient } = await import("@/lib/client");
  const response = await tryClient("/api/connect/deployment-mode", {
    method: "PUT",
    body: {
      mode: next.mode,
      ...(next.mode === "cloud" && next.cloudUrl
        ? { cloudUrl: next.cloudUrl }
        : {}),
    },
  });
  const body = (await response.json().catch(() => null)) as {
    mode?: string;
    cloudUrl?: string;
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error || `Speichern fehlgeschlagen (${response.status})`);
  }
  const saved: DeploymentModeState = {
    mode: body?.mode === "cloud" ? "cloud" : "local",
    cloudUrl:
      typeof body?.cloudUrl === "string" ? body.cloudUrl : undefined,
  };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
  return saved;
}

export function subscribeDeploymentMode(cb: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

import { useQuery } from "@tanstack/react-query";

/**
 * Laeuft diese Connect-Seite auf dem PC? (helium-mobilefix, 17.10.2026)
 *
 * Vorher hiess "nicht localhost" automatisch "online/gehostet". Ueber den Handy-Tunnel
 * (https://*.trycloudflare.com) ist der Server aber der PC selbst - das Brain antwortet dort.
 * Deshalb: localhost/127.0.0.1 => PC; sonst PC, sobald die Brain-API des PCs antwortet.
 * Nur der lokale Server liefert bei /api/brain/status ein `path`-Feld (auch wenn der Ordner fehlt);
 * die gehostete Version antwortet 403/404 oder ohne `path`.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHost(): boolean {
  if (typeof window === "undefined") return false;
  return LOOPBACK.has(window.location.hostname);
}

async function probeBrainApi(): Promise<boolean> {
  try {
    const response = await fetch("/api/brain/status", { credentials: "include", headers: { accept: "application/json" } });
    if (!response.ok) return false;
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) return false;
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return !!body && typeof body === "object" && ("path" in body || body.available === true);
  } catch {
    return false;
  }
}

/** `pc`: Server ist der PC (direkt oder per Tunnel). `pending`: Pruefung laeuft noch. */
export function useConnectOnPc(): { pc: boolean; pending: boolean } {
  const loopback = isLoopbackHost();
  const probe = useQuery({
    queryKey: ["brain", "pc-probe"],
    queryFn: probeBrainApi,
    enabled: !loopback,
    staleTime: 60_000,
    retry: false,
  });
  return { pc: loopback || probe.data === true, pending: !loopback && probe.isPending };
}

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Live preview of the agent's own Chrome/Helium profile (separate --user-data-dir).
 * The server captures the active tab via CDP (Page.captureScreenshot on 127.0.0.1)
 * — see GET /api/connect/agent-chrome/screenshot.
 */
export function useAgentChromeFrame(
  agentId: string,
  {
    active = true,
    intervalMs = 1500,
    profileKind = "default",
    onUnavailable,
  }: {
    active?: boolean;
    intervalMs?: number;
    profileKind?: "default" | "manus";
    /** Called once when the agent browser stays unreachable (e.g. window closed) — relaunch. */
    onUnavailable?: () => void;
  } = {},
) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState<string>("");
  const lastUrl = useRef<string | null>(null);
  const failures = useRef(0);
  const firedUnavailable = useRef(false);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const qs = new URLSearchParams({ agentId, profileKind, t: String(Date.now()) });
        const res = await fetch(`/api/connect/agent-chrome/screenshot?${qs}`, {
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (cancelled) return;
        if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) {
          const blob = await res.blob();
          if (cancelled) return;
          const next = URL.createObjectURL(blob);
          if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
          lastUrl.current = next;
          setSrc(next);
          setError(null);
          failures.current = 0;
          const header = res.headers.get("x-connect-page-url");
          setPageUrl(header ? safeDecode(header) : "");
        } else {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? `Vorschau nicht verfügbar (${res.status})`);
          failures.current += 1;
        }
      } catch {
        if (!cancelled) setError("Vorschau nicht erreichbar.");
        failures.current += 1;
      }
      if (!cancelled && failures.current >= 3 && !firedUnavailable.current) {
        // Only once per mount — never loop-launching windows.
        firedUnavailable.current = true;
        unavailableRef.current?.();
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, agentId, intervalMs, profileKind]);

  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  return { src, error, pageUrl };
}

function safeDecode(value: string) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

/** Bring the agent's browser window/tab to the front (CDP Page.bringToFront). */
export async function focusAgentChrome(
  agentId: string,
  profileKind: "default" | "manus" = "default",
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/connect/agent-chrome/focus", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, profileKind }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return { ok: Boolean(res.ok && body?.ok), error: body?.error };
  } catch {
    return { ok: false, error: "Agent-Browser nicht erreichbar." };
  }
}

export function AgentChromeLive({
  agentId,
  intervalMs,
  className,
  imgClassName,
  fallback,
  active = true,
  onUnavailable,
}: {
  agentId: string;
  intervalMs?: number;
  className?: string;
  imgClassName?: string;
  /** Rendered until the first frame arrives or when capturing fails. */
  fallback: (error: string | null) => ReactNode;
  active?: boolean;
  onUnavailable?: () => void;
}) {
  const { src, error } = useAgentChromeFrame(agentId, { active, intervalMs, onUnavailable });
  if (!src || error) {
    return <>{fallback(error)}</>;
  }
  return (
    <img
      alt="Live-Vorschau Agent-Browser"
      className={cn("h-full w-full object-cover object-top", imgClassName, className)}
      draggable={false}
      src={src}
    />
  );
}

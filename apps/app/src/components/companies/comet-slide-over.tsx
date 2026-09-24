import {
  IconBolt,
  IconExternalLink,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  isDesktopApp,
  navigateDesktopBrowser,
} from "@/lib/desktop-bridge";
import { cn } from "@/lib/utils";

/**
 * Comet-style assistant slide-over — surfaces page context actions in the
 * sidebar whenever the user is browsing an external site inside Connect.
 *
 * Reads `browser_status` events sent from the WPF host via
 * `desktop-bridge.postMessage`. When the active URL leaves localhost, a
 * compact AI prompt appears with three quick actions:
 *   - Analyse the page with the focused agent
 *   - Summarise the page
 *   - Research the domain with a research agent
 */
export function CometSlideOver({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [hostUrl, setHostUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      try {
        const data = event.data as { type?: string; url?: string; title?: string } | null;
        if (!data || typeof data !== "object") return;
        if (data.type !== "browser_status") return;
        const url = (data.url ?? "").trim();
        if (!url) {
          setHostUrl(null);
          return;
        }
        const isInternal = url.startsWith("http://localhost:3010") ||
          url.startsWith("https://localhost:3010") ||
          url.startsWith("http://127.0.0.1") ||
          url.startsWith("https://127.0.0.1");
        setHostUrl(isInternal ? null : url);
        setTitle((data.title ?? "").trim());
      } catch {
        // Ignore malformed messages.
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!hostUrl) return null;

  let host = "";
  try {
    host = new URL(hostUrl).hostname.replace(/^www\./, "");
  } catch {
    host = hostUrl;
  }

  const ask = (action: "analyse" | "summary" | "research", prompt: string) => {
    const payload = {
      type: "agent_task",
      action,
      url: hostUrl,
      title,
      prompt,
    };
    // Push the task into the agent system via a localStorage bridge so a
    // channel can pick it up. We also surface a toast for the user.
    try {
      window.localStorage.setItem(
        "connect.pending-agent-task",
        JSON.stringify({ ...payload, at: new Date().toISOString() }),
      );
    } catch {
      // localStorage unavailable — fall through silently.
    }

    if (isDesktopApp()) {
      navigateDesktopBrowser("http://localhost:3010/agents");
    } else {
      void navigate({ to: "/agents" });
    }
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      className={cn(
        "pointer-events-auto mx-1 mb-2 rounded-2xl border border-sidebar-border/70 bg-gradient-to-br from-sky-500/[0.06] via-background to-violet-500/[0.05] p-2.5 shadow-[0_8px_24px_-12px_rgba(56,189,248,0.45)]",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-violet-500 text-[10px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
            <IconSparkles className="size-3" stroke={2} />
          </span>
          <p className="truncate text-[11px] font-semibold tracking-tight text-sidebar-foreground">
            Comet AI · {host}
          </p>
        </div>
        <button
          aria-label={open ? "Assistent einklappen" : "Assistent öffnen"}
          className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          {open ? <IconX className="size-3.5" stroke={1.75} /> : <IconSparkles className="size-3.5" stroke={1.75} />}
        </button>
      </div>

      {title ? (
        <p className="mb-2 line-clamp-2 text-[11px] leading-snug text-sidebar-foreground/55">
          {title}
        </p>
      ) : null}

      {open ? (
        <>
          <div className="flex items-center gap-1.5 rounded-xl border border-sidebar-border/60 bg-background px-2 py-1.5">
            <IconBolt className="size-3 shrink-0 text-amber-500" stroke={1.75} />
            <input
              className="min-w-0 flex-1 bg-transparent text-[12px] text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/35"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  ask("analyse", query.trim());
                }
              }}
              placeholder="Frag Comet zu dieser Seite…"
              value={query}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            <QuickAction
              label="Analysieren"
              onClick={() => ask("analyse", `Analysiere ${hostUrl}`)}
            />
            <QuickAction
              label="Zusammenfassen"
              onClick={() => ask("summary", `Erstelle eine Zusammenfassung von ${hostUrl}`)}
            />
            <QuickAction
              label="Recherche"
              onClick={() => ask("research", `Führe eine Recherche zu ${host} durch`)}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-1">
          <QuickAction
            label="Analysieren"
            onClick={() => ask("analyse", `Analysiere ${hostUrl}`)}
          />
          <QuickAction
            label="Zusammenfassen"
            onClick={() => ask("summary", `Erstelle eine Zusammenfassung von ${hostUrl}`)}
          />
          <QuickAction
            label="Recherche"
            onClick={() => ask("research", `Recherchiere ${host}`)}
          />
          <a
            className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-medium text-sky-600 transition-colors hover:bg-sky-500/10 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
            href={hostUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <IconExternalLink className="size-3" stroke={1.75} />
            Öffnen
          </a>
        </div>
      )}
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex h-6 items-center rounded-full border border-sidebar-border/70 bg-background/80 px-2.5 text-[10.5px] font-medium text-sidebar-foreground/80 transition-colors hover:border-sidebar-accent hover:bg-sidebar-accent hover:text-sidebar-foreground"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

import {
  IconArrowDown,
  IconArrowUp,
  IconKeyboard,
  IconMaximize,
  IconMinimize,
  IconPlayerPlay,
  IconRefresh,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LiveScreen } from "@/components/computer/live-screen";
import { Button } from "@/components/ui/button";

/**
 * helium-appcast: rechte Live-Vorschau einer Multi-Login-App (Codex, Antigravity, Manus).
 *
 * Gleiches Prinzip wie die Agent-Browser-Vorschau: der Server haengt sich per CDP an die App (Debug-
 * Port nur auf 127.0.0.1) und streamt Frames ueber `/api/app-accounts/:id/screencast`. Klicks,
 * Mausrad und Tasten im Bild gehen an die App; unten ein Eingabefeld fuer Prompts (auch am Handy).
 *
 * helium-ui-fullpreview: Die Vorschau belegt den GANZEN Hauptbereich rechts neben der Connect-
 * Seitenleiste (Chat darunter wird komplett verdeckt). Der Vollbild-Knopf legt sie ueber das ganze
 * Browserfenster (Seitenleiste verdeckt) und nutzt – falls vorhanden – die Fullscreen-API.
 * Esc oder erneuter Klick beendet das Vollbild.
 */

/** Rechte Kante der sichtbaren Desktop-Seitenleiste (0, wenn keine da ist, z. B. am Handy). */
function sidebarRightEdge(): number {
  if (typeof document === "undefined") return 0;
  const containers = document.querySelectorAll<HTMLElement>('[data-slot="sidebar-container"]');
  let edge = 0;
  for (const el of containers) {
    if (el.dataset.side === "right") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.right > 0) edge = Math.max(edge, rect.right);
  }
  return Math.round(edge);
}
type Props = {
  accountId: string;
  title: string;
  onClose: () => void;
};

export function AppPreviewPanel({ accountId, title, onClose }: Props) {
  const control = useRef<((message: Record<string, unknown>) => void) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [windowTitle, setWindowTitle] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [left, setLeft] = useState(() => sidebarRightEdge());

  // Seitenleiste kann ein-/ausklappen (Animation) – Position leicht nachfuehren.
  useEffect(() => {
    const update = () => setLeft((prev) => {
      const next = sidebarRightEdge();
      return prev === next ? prev : next;
    });
    update();
    const timer = window.setInterval(update, 400);
    window.addEventListener("resize", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Browser-Vollbild verlassen (Esc durch den Browser) -> Zustand angleichen.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Esc beendet das Vollbild auch ohne Fullscreen-API (z. B. iOS Safari).
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFullscreen(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Beim Schliessen ein evtl. noch aktives Browser-Vollbild beenden.
  useEffect(
    () => () => {
      if (typeof document !== "undefined" && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    },
    [],
  );

  const toggleFullscreen = () => {
    if (fullscreen) {
      setFullscreen(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      return;
    }
    setFullscreen(true);
    const el = panelRef.current;
    if (el && typeof el.requestFullscreen === "function" && document.fullscreenEnabled !== false) {
      void el.requestFullscreen().catch(() => undefined);
    }
  };

  const onProblem = useCallback((p: string | null) => setProblem(p), []);
  const onMessage = useCallback((m: { type: string; [key: string]: unknown }) => {
    if (m.type === "target" && typeof m.title === "string") setWindowTitle(m.title);
    if (m.type === "sent") {
      setNote("An die App gesendet.");
      window.setTimeout(() => setNote(null), 2500);
    }
  }, []);

  const sendPrompt = (submit: boolean) => {
    const text = prompt.trim();
    if (!text) return;
    if (!control.current) {
      setNote("Keine Verbindung zur Vorschau.");
      return;
    }
    control.current({ type: "prompt", text, submit });
    setPrompt("");
  };

  const scroll = (deltaY: number) => control.current?.({ type: "scroll", deltaY });

  const panel = (
    <aside
      ref={panelRef}
      className={`fixed inset-y-0 right-0 flex flex-col bg-background ${fullscreen ? "z-[80]" : "z-[60] border-l border-border"}`}
      style={{ left: fullscreen ? 0 : left }}
      aria-label={`Live-Vorschau ${title}`}
      data-testid="app-preview-panel"
      data-fullscreen={fullscreen ? "true" : "false"}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            Live-Vorschau vom PC{windowTitle ? ` · ${windowTitle}` : ""}
          </p>
        </div>
        <Button
          size="icon"
          variant={keyboard ? "default" : "ghost"}
          className="size-8 rounded-lg"
          title={keyboard ? "Tastatur geht an die App (klicken zum Ausschalten)" : "Tastatur an die App weiterleiten"}
          onClick={() => setKeyboard((v) => !v)}
        >
          <IconKeyboard className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8 rounded-lg" title="Hochscrollen" onClick={() => scroll(-500)}>
          <IconArrowUp className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8 rounded-lg" title="Runterscrollen" onClick={() => scroll(500)}>
          <IconArrowDown className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-lg"
          title="Neu verbinden"
          onClick={() => {
            setProblem(null);
            setGeneration((g) => g + 1);
          }}
        >
          <IconRefresh className="size-4" />
        </Button>
        <Button
          size="icon"
          variant={fullscreen ? "default" : "ghost"}
          className="size-8 rounded-lg"
          title={fullscreen ? "Vollbild beenden (Esc)" : "Vollbild"}
          aria-pressed={fullscreen}
          data-testid="app-preview-fullscreen"
          onClick={toggleFullscreen}
        >
          {fullscreen ? <IconMinimize className="size-4" /> : <IconMaximize className="size-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="size-8 rounded-lg" title="Vorschau schliessen (App laeuft weiter)" onClick={onClose}>
          <IconX className="size-4" />
        </Button>
      </header>

      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-black"
        onMouseDownCapture={() => {
          const active = document.activeElement as HTMLElement | null;
          if (active && active.tagName === "TEXTAREA") active.blur();
          setKeyboard(true);
        }}
      >
        {problem ? (
          <div className="absolute inset-x-3 top-3 z-10 rounded-lg border border-amber-500/40 bg-amber-500/90 p-3 text-black text-xs">
            {problem}
          </div>
        ) : null}
        <div className="absolute inset-0">
        <LiveScreen
          fit
          key={`${accountId}:${generation}`}
          computerId={accountId}
          streamPath={`/api/app-accounts/${encodeURIComponent(accountId)}/screencast`}
          driving
          keyboard={keyboard}
          controlRef={control}
          onProblem={onProblem}
          onMessage={onMessage}
        />
        </div>
      </div>

      <footer className="border-t border-border p-2">
        {note ? <p className="px-1 pb-1 text-[11px] text-emerald-400">{note}</p> : null}
        <div className="flex items-end gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setKeyboard(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendPrompt(true);
              }
            }}
            rows={2}
            placeholder={`Prompt an ${title} … (Enter = senden, Shift+Enter = neue Zeile)`}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary"
            data-testid="app-preview-input"
          />
          <div className="flex flex-col gap-1">
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => sendPrompt(true)} disabled={!prompt.trim()}>
              <IconSend className="size-3.5" />
              Senden
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 rounded-xl text-[11px]"
              title="Nur einfuegen, nicht abschicken"
              onClick={() => sendPrompt(false)}
              disabled={!prompt.trim()}
            >
              <IconPlayerPlay className="size-3" />
              Einfügen
            </Button>
          </div>
        </div>
        <p className="px-1 pt-1 text-[10px] text-muted-foreground">
          Klick ins Bild steuert die App (Maus, Rad, Tastatur). Das Eingabefeld schreibt in das Prompt-Feld der App.
        </p>
      </footer>
    </aside>
  );

  return typeof document === "undefined" ? panel : createPortal(panel, document.body);
}

export default AppPreviewPanel;

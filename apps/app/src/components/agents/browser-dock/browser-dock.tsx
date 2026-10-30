/**
 * A32 — Browser seitlich andocken (Ideen I8/I10).
 *
 * EIGENTÜMER: A32. Lane: `apps/app/src/components/agents/browser-dock/**`.
 *
 * Ein Umschalter zwischen
 *  - „schwebend" (bisheriges Verhalten, nutzt `FloatingPanel`) und
 *  - „angedockt" (rechte Leiste im normalen Fluss, Breite ziehbar/gemerkt).
 *
 * Einbau (Wunsch an A39/A40, außerhalb dieser Lane):
 * ```tsx
 * <div className="flex h-full min-h-0">
 *   <main className="min-w-0 flex-1">{chat}</main>
 *   <BrowserDock agentId={agent.id} agentName={agent.name} />
 * </div>
 * ```
 * Bei Flag aus rendert die Komponente `null` — das alte Verhalten bleibt.
 *
 * Bewusst KEIN Zugriff auf Stefans Helium-Profil: der Inhalt kommt aus
 * Connects Agent-Chrome-Steuerung bzw. einer optionalen T3-Brücke; beides
 * arbeitet auf dem eigenen Profil des Agenten.
 */

import {
  IconBrandChrome,
  IconLayoutSidebarRightExpand,
  IconPictureInPicture,
  IconX,
} from "@tabler/icons-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { FloatingPanel } from "@/components/channels/floating-panel";
import { Button } from "@/components/ui/button";
import { getT3Flag } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";
import { BrowserDockView } from "./browser-dock-view";
import {
  BROWSER_DOCK_WIDTH_MAX,
  BROWSER_DOCK_WIDTH_MIN,
} from "./storage";
import { useBrowserDock, useNarrowViewport } from "./use-browser-dock";
import type {
  BrowserDockMode,
  BrowserDockRenderContext,
  T3PreviewBridge,
} from "./types";

export type BrowserDockProps = {
  agentId: string;
  agentName: string;
  /** Nur für Einbettung/Tests; sonst gilt die gespeicherte Wahl. */
  defaultMode?: BrowserDockMode;
  /** Für Tests und Einbettung mit eigenem Flag; sonst `bridge` aus A01. */
  forceFlag?: boolean;
  onClose?: () => void;
  className?: string;
  /** Optionale T3-Browser-Vorschau; ohne sie bleibt Connect allein zuständig. */
  t3Preview?: T3PreviewBridge;
  /** Test-/Einbettungs-Slot für den Inhalt. */
  renderContent?: (context: BrowserDockRenderContext) => ReactNode;
};

/**
 * Andockleiste mit Flag-Gate.
 *
 * Es gibt (noch) kein eigenes A01-Flag für das Dock; bis dahin gilt
 * `connect.t3.bridge` — die Vorschau ist Teil der T3-Integration, und
 * „Flag aus = altes Verhalten" bleibt damit gewahrt.
 */
export function BrowserDock(props: BrowserDockProps) {
  const enabled =
    typeof props.forceFlag === "boolean"
      ? props.forceFlag
      : getT3Flag("bridge");
  if (!enabled) return null;
  return <BrowserDockInner {...props} />;
}

function BrowserDockInner({
  agentId,
  agentName,
  defaultMode,
  onClose,
  className,
  t3Preview,
  renderContent,
}: BrowserDockProps) {
  const dock = useBrowserDock({ defaultMode });
  const narrow = useNarrowViewport();
  // Auf schmalen Fenstern gibt es keinen Platz rechts — dann schwebend.
  const mode: BrowserDockMode = narrow ? "floating" : dock.mode;
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: dock.width };
    setResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dock.setWidth(drag.startWidth + (drag.startX - event.clientX));
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setResizing(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* schon freigegeben */
    }
    dock.setWidth(dock.width, true);
  };

  const resizeByKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = dock.width + step;
    else if (event.key === "ArrowRight") next = dock.width - step;
    else if (event.key === "Home") next = BROWSER_DOCK_WIDTH_MAX;
    else if (event.key === "End") next = BROWSER_DOCK_WIDTH_MIN;
    if (next === null) return;
    event.preventDefault();
    dock.setWidth(next, true);
  };

  const content = renderContent
    ? renderContent({
        agentId,
        agentName,
        mode,
        setMode: dock.setMode,
        t3Preview,
      })
    : <BrowserDockView agentId={agentId} t3Preview={t3Preview} />;

  const header = (
    <DockHeader
      agentName={agentName}
      dockedDisabled={narrow}
      mode={mode}
      onClose={onClose}
      onSelectMode={dock.setMode}
    />
  );

  if (mode === "docked") {
    return (
      <aside
        aria-label={`Browser von ${agentName}`}
        className={cn(
          "relative flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-sidebar",
          resizing && "select-none",
          className,
        )}
        data-mode="docked"
        data-testid="browser-dock"
        style={{ width: dock.width }}
      >
        <div
          aria-label="Breite der Browser-Andockleiste"
          aria-orientation="vertical"
          aria-valuemax={BROWSER_DOCK_WIDTH_MAX}
          aria-valuemin={BROWSER_DOCK_WIDTH_MIN}
          aria-valuenow={dock.width}
          className={cn(
            "absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none transition-colors hover:bg-foreground/10 focus-visible:bg-foreground/20 focus-visible:outline-none",
            resizing && "bg-foreground/20",
          )}
          data-testid="browser-dock-resize"
          onKeyDown={resizeByKey}
          onPointerCancel={endResize}
          onPointerDown={beginResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          role="separator"
          tabIndex={0}
        />
        {header}
        <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
      </aside>
    );
  }

  return (
    <FloatingPanel
      className={cn("max-h-[min(78vh,46rem)] bg-card", className)}
      defaultPos={() => ({
        x: Math.max(
          16,
          (typeof window === "undefined" ? 1440 : window.innerWidth) -
            dock.width -
            24,
        ),
        y: Math.max(
          16,
          Math.round(
            (typeof window === "undefined" ? 900 : window.innerHeight) * 0.16,
          ),
        ),
      })}
      hideHeader
      storageKey={`connect.browser-dock.pos.${agentId}`}
      width={dock.width}
      zIndex={45}
    >
      <div
        className="flex h-[min(60vh,34rem)] flex-col"
        data-mode="floating"
        data-testid="browser-dock"
      >
        {header}
        <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
      </div>
    </FloatingPanel>
  );
}

function DockHeader({
  agentName,
  dockedDisabled,
  mode,
  onClose,
  onSelectMode,
}: {
  agentName: string;
  dockedDisabled: boolean;
  mode: BrowserDockMode;
  onClose?: () => void;
  onSelectMode: (mode: BrowserDockMode) => void;
}) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 px-2">
      <IconBrandChrome className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium leading-tight">Browser</p>
        <p className="truncate text-[10px] leading-tight text-muted-foreground">
          {agentName}
        </p>
      </div>
      <div
        aria-label="Browser-Fenster"
        className="flex h-7 shrink-0 items-center rounded-full border border-border bg-muted/40 p-0.5"
        role="group"
      >
        <ModeButton
          active={mode === "floating"}
          icon={<IconPictureInPicture className="size-3" />}
          label="Schwebend"
          onClick={() => onSelectMode("floating")}
          testId="browser-dock-mode-floating"
        />
        <ModeButton
          active={mode === "docked"}
          disabled={dockedDisabled}
          icon={<IconLayoutSidebarRightExpand className="size-3" />}
          label="Angedockt"
          onClick={() => onSelectMode("docked")}
          testId="browser-dock-mode-docked"
          title={
            dockedDisabled
              ? "Auf schmalen Fenstern nur schwebend"
              : "Rechts andocken"
          }
        />
      </div>
      {onClose ? (
        <Button
          aria-label="Browser-Dock schließen"
          onClick={onClose}
          size="icon"
          title="Schließen"
          type="button"
          variant="ghost"
        >
          <IconX className="size-3.5" />
        </Button>
      ) : null}
    </header>
  );
}

function ModeButton({
  active,
  disabled,
  icon,
  label,
  onClick,
  testId,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
  title?: string;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex h-6 items-center gap-1 rounded-full px-1.5 text-[10px] font-medium transition",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
      )}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

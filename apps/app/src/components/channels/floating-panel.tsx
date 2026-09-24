import { IconGripHorizontal } from "@tabler/icons-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type Pos = { x: number; y: number };

function readPos(key: string): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pos;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writePos(key: string, pos: Pos) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(pos));
}

/**
 * Draggable chrome shell — same “ziehen” pattern as the home composer.
 * Position is persisted per `storageKey`.
 */
export function FloatingPanel({
  storageKey,
  title,
  children,
  className,
  width = "min(22rem, calc(100vw - 1.5rem))",
  defaultPos,
  zIndex = 40,
  hideHeader = false,
}: {
  storageKey: string;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  width?: string | number;
  defaultPos: () => Pos;
  zIndex?: number;
  /** No title bar — drag via `[data-floating-drag]` in children. */
  hideHeader?: boolean;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>(() => readPos(storageKey) ?? defaultPos());
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const clamp = useCallback((next: Pos): Pos => {
    const el = shellRef.current;
    const w = el?.offsetWidth ?? 360;
    const h = el?.offsetHeight ?? 200;
    const maxX = Math.max(8, window.innerWidth - w - 8);
    const maxY = Math.max(8, window.innerHeight - h - 8);
    return {
      x: Math.min(maxX, Math.max(8, next.x)),
      y: Math.min(maxY, Math.max(8, next.y)),
    };
  }, []);

  useEffect(() => {
    setPos((p) => clamp(p));
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest(
        "textarea, input, button, a, [contenteditable=true], [role='textbox'], [data-slot='select-trigger'], iframe",
      )
    ) {
      return;
    }
    event.preventDefault();
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    setPos(
      clamp({
        x: drag.current.originX + (event.clientX - drag.current.startX),
        y: drag.current.originY + (event.clientY - drag.current.startY),
      }),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    setPos((p) => {
      const next = clamp(p);
      writePos(storageKey, next);
      return next;
    });
  };

  return (
    <div
      className={cn(
        "fixed flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-lg shadow-black/10",
        dragging && "cursor-grabbing select-none",
        className,
      )}
      ref={shellRef}
      style={{
        left: pos.x,
        top: pos.y,
        width,
        zIndex,
      }}
    >
      {hideHeader ? null : (
        <div
          className="flex cursor-grab items-center gap-2 border-b border-border/70 px-3 py-1.5 text-muted-foreground active:cursor-grabbing"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {title}
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px]">
            <IconGripHorizontal className="size-3.5" aria-hidden />
            ziehen
          </span>
        </div>
      )}
      <div
        className="min-h-0 flex-1 overflow-auto"
        onPointerDown={hideHeader ? beginDrag : undefined}
        onPointerMove={hideHeader ? moveDrag : undefined}
        onPointerUp={hideHeader ? endDrag : undefined}
        onPointerCancel={hideHeader ? endDrag : undefined}
      >
        {children}
      </div>
    </div>
  );
}

import { IconX } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EASE_OUT } from "@/lib/motion";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
import { BotPane } from "@/components/agents/bot-pane";
import { getT3Flag } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";

/**
 * A main pane with details beside it when there is room, or in a sheet on narrow windows.
 *
 * The open/closed state belongs to the caller, in practice a search parameter, so opening a detail
 * is a real navigation: it survives a reload, it can be linked to, and Back closes it.
 *
 * The pane is animated by width and the content inside it is given that width outright, so the
 * content is laid out once and the pane reveals it.
 */

const ANIMATION_DURATION_SECONDS = 0.3;
const DEFAULT_DETAIL_WIDTH = 400;
const MIN_MAIN_WIDTH = 400;

/**
 * The content overlaps the tail of the pane rather than following it.
 *
 * Delaying content slightly but ending with the pane keeps the reveal as one motion.
 */
const CONTENT_ENTRANCE_SECONDS = 0.18;
const CONTENT_ENTRANCE_DELAY_SECONDS = 0.12;
const CONTENT_ENTRANCE_OFFSET = "translateY(8px)";

/**
 * Liest die Agent-Id aus der Adresse, ohne den Router zu brauchen.
 *
 * Das Panel wird auch ohne `RouterProvider` gerendert (Tests, eingebettete Flächen).
 * Deshalb wird die Route nicht über einen Router-Hook gelesen — ein Hook hier würde
 * in diesen Fällen werfen. Die Pfadlektüre ist bewusst simpel: die Route
 * `/agent/<id>` ist die einzige, auf der ein Bot seine eigene Leiste hat.
 */
function readAgentIdFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const match = window.location.pathname.match(/\/agent\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function DetailPanel({
  open,
  onClose,
  title,
  detail,
  detailWidth = DEFAULT_DETAIL_WIDTH,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Rendered at the left of the detail pane's header row, beside the close button. */
  title?: ReactNode;
  detail?: ReactNode;
  /** Open width of the detail pane, in pixels. */
  detailWidth?: number;
  children: ReactNode;
}) {
  /*
   * Bot-Panel (A27, Idee I11) — Details / Bibliothek / Computer.
   *
   * Das Panel steht hinter dem Flag `mascot`. Ist es aus, bleibt das Detailpanel
   * exakt wie heute: der Aufrufer liefert den Inhalt, hier ändert sich nichts.
   *
   * Die Route `/agent/$agentId` ist der einzige Ort, an dem ein Bot seine eigene
   * Leiste hat. Deshalb wird der Agent aus den Route-Parametern gelesen — das Panel
   * zeigt genau den Bot, dessen Unterhaltung offen ist.
   */
  const routeAgentId = readAgentIdFromLocation();
  const botPaneEnabled = getT3Flag("mascot") && Boolean(routeAgentId);
  /*
   * Der Inhalt des Panels.
   *
   * Reihenfolge der Wahrheit:
   * 1. Der Aufrufer liefert `detail` (z. B. das laufende Bild beim „Zusehen") — das gewinnt
   *    immer. Das Bot-Panel darf eine bestehende Live-Ansicht nicht verdrängen.
   * 2. Sonst das Bot-Panel (A27): Details / Bibliothek / Computer.
   * 3. Ohne Flag exakt wie vorher: der Inhalt des Aufrufers.
   *
   * Der Name kommt bewusst nicht über eine eigene Query hier: `BotPane` holt sich die
   * Agent-Daten in seinem Details-Tab selbst. Eine zweite Query an derselben Stelle
   * wäre doppelt — und würde `DetailPanel` an einen QueryClient binden, den es
   * bislang nicht brauchte.
   */
  const panelContent =
    detail ??
    (botPaneEnabled ? (
      <BotPane agentId={routeAgentId as string} name="Bot" />
    ) : null);
  // Reduced motion keeps the fade, which explains the change, and drops the movement.
  const shouldReduceMotion = useReducedMotion();
  // Handy (helium-mobile4): Details als bildschirmfüllende Seite im Tech-Look statt 400px-Leiste.
  const mobile = useMobileShell();
  const container = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState(true);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = (width: number) =>
      setOverlay(width < detailWidth + MIN_MAIN_WIDTH);
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [detailWidth]);

  return (
    <div ref={container} className="flex h-full min-h-0">
      <div className="flex flex-1 min-w-0 flex-col">{children}</div>
      {overlay ? (
        <Sheet
          open={open}
          onOpenChange={(next) => {
            if (!next) onClose();
          }}
        >
          <SheetContent
            className={cn(
              "gap-0",
              mobile &&
                "border-0 bg-[#07080c] bg-[radial-gradient(120%_50%_at_10%_-10%,rgba(56,189,248,0.12),transparent_55%),radial-gradient(90%_40%_at_100%_0%,rgba(167,139,250,0.1),transparent_50%)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white",
            )}
            style={
              mobile
                ? { width: "100vw", maxWidth: "100vw" }
                : { width: `min(${detailWidth}px, 100vw)`, maxWidth: "100vw" }
            }
          >
            <SheetTitle
              className={cn(
                "h-12 shrink-0 px-4 pr-12 flex items-center",
                mobile && "h-14 border-b border-white/[0.06] text-[17px] font-semibold tracking-tight",
              )}
            >
              {title ?? "Details"}
            </SheetTitle>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {open ? panelContent : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <motion.div
          animate={{ width: open ? detailWidth : 0 }}
          className="shrink-0 overflow-hidden"
          // No entry animation on first paint: URL-opened panels should appear as initial state.
          initial={false}
          transition={{
            duration: shouldReduceMotion ? 0 : ANIMATION_DURATION_SECONDS,
            ease: EASE_OUT,
          }}
        >
          <div
            className="flex h-full flex-col bg-sidebar border-l border-border"
            style={{ width: detailWidth }}
          >
            {/* Rendered for the whole animation, so the way out is available immediately. */}
            <div className="h-12 shrink-0 sticky top-0 flex flex-row items-center justify-between px-2 gap-2">
              <div className="flex min-w-0 w-full items-center gap-1.5">
                {title}
              </div>
              <div className="flex flex-row gap-1.5">
                <Button
                  aria-label="Close details"
                  onClick={onClose}
                  variant="ghost"
                  size="icon"
                >
                  <IconX className="size-4.5" />
                </Button>
              </div>
            </div>
            {/*
             * Unmount while closed so dismissed form state and detail queries do not remain active.
             */}
            {open ? (
              <motion.div
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                className="flex-1 min-h-0 overflow-y-auto"
                initial={{
                  opacity: 0,
                  transform: shouldReduceMotion
                    ? "none"
                    : CONTENT_ENTRANCE_OFFSET,
                }}
                transition={{
                  delay: shouldReduceMotion
                    ? 0
                    : CONTENT_ENTRANCE_DELAY_SECONDS,
                  duration: CONTENT_ENTRANCE_SECONDS,
                  ease: EASE_OUT,
                }}
              >
                {panelContent}
              </motion.div>
            ) : null}
          </div>
        </motion.div>
      )}
    </div>
  );
}

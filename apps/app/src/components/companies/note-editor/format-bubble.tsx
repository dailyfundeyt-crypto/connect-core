import {
  IconBold,
  IconCode,
  IconItalic,
  IconLink,
  IconStrikethrough,
  IconUnderline,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { NoteMark } from "@/lib/companies/notes";

/**
 * The formatting bar that floats over a selection.
 *
 * It is deliberately a plain `contentEditable`-based command bar rather than a model-driven one:
 * the browser already owns the selection and knows how to apply bold, italic and underline to it,
 * so the button calls the browser's own command and the block's `input` event writes the result
 * back through the same path as typing. Driving it from the model instead would mean re-implementing
 * selection ranges by hand for no benefit.
 *
 * The bar only appears when there is a real selection — a collapsed caret hides it, because there
 * is nothing to format.
 */
export function FormatBubble({
  containerRef,
  onLink,
}: {
  /** The scroll container, so the position is measured in viewport coordinates. */
  containerRef: React.RefObject<HTMLElement | null>;
  onLink?: () => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});

  const measure = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setPosition(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPosition(null);
      return;
    }
    /*
     * Above the selection, and flipped below when there is no room. The toolbar is 34px tall plus
     * an 8px gap, which is what the offsets below reserve.
     */
    const above = rect.top > 52;
    setPosition({
      top: above ? rect.top - 42 : rect.bottom + 8,
      left: Math.round(
        Math.min(
          Math.max(8, rect.left + rect.width / 2 - 130),
          window.innerWidth - 268,
        ),
      ),
    });
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      measure();
      setActive(readActiveMarks());
    };
    document.addEventListener("selectionchange", onSelectionChange);
    // Scrolling moves the selection with it, so the bar has to follow or it detaches from the text.
    const scroller = containerRef.current;
    scroller?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      scroller?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure, containerRef]);

  if (!position) return null;

  const run = (mark: NoteMark["type"]) => {
    const command = COMMANDS[mark];
    if (command) document.execCommand(command);
    // The command does not always fire `input`, so the bar nudges the block itself.
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element =
      node instanceof HTMLElement
        ? node
        : node?.parentElement ?? null;
    element?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-black/10 bg-neutral-900 px-1 py-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
      // The toolbar must not steal the selection it is about to act on.
      onMouseDown={(event) => event.preventDefault()}
      role="toolbar"
      aria-label="Text formatieren"
    >
      <BubbleButton
        active={active.bold}
        label="Fett"
        onClick={() => run("bold")}
      >
        <IconBold className="size-4" stroke={2} />
      </BubbleButton>
      <BubbleButton
        active={active.italic}
        label="Kursiv"
        onClick={() => run("italic")}
      >
        <IconItalic className="size-4" stroke={1.75} />
      </BubbleButton>
      <BubbleButton
        active={active.underline}
        label="Unterstrichen"
        onClick={() => run("underline")}
      >
        <IconUnderline className="size-4" stroke={1.75} />
      </BubbleButton>
      <BubbleButton
        active={active.strike}
        label="Durchgestrichen"
        onClick={() => run("strike")}
      >
        <IconStrikethrough className="size-4" stroke={1.75} />
      </BubbleButton>
      <BubbleButton
        active={active.code}
        label="Code"
        onClick={() => run("code")}
      >
        <IconCode className="size-4" stroke={1.75} />
      </BubbleButton>
      {onLink ? (
        <>
          <span className="mx-0.5 h-4 w-px bg-white/15" />
          <BubbleButton label="Link" onClick={onLink}>
            <IconLink className="size-4" stroke={1.75} />
          </BubbleButton>
        </>
      ) : null}
    </div>
  );
}

/** Only the four the browser can toggle on its own; code and link go through the model. */
const COMMANDS: Partial<Record<NoteMark["type"], string>> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strike: "strikeThrough",
};

function BubbleButton({
  active,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-7 items-center justify-center rounded text-white/80 transition-colors",
        "hover:bg-white/15 hover:text-white",
        active && "bg-white/20 text-white",
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

/** Which marks the current selection already carries, so the buttons show as pressed. */
function readActiveMarks(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return out;
  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  out.bold = fragment.querySelector("strong, b") !== null;
  out.italic = fragment.querySelector("em, i") !== null;
  out.underline = fragment.querySelector("u") !== null;
  out.strike = fragment.querySelector("s, strike, del") !== null;
  out.code = fragment.querySelector("code") !== null;
  return out;
}
import { type RefObject, useCallback, useEffect } from "react";

/**
 * Drive an iframe's session history like a browser — for when chrome
 * (back / forward buttons) was removed.
 *
 * Cross-origin: `history.back()` / `forward()` are callable; reading
 * location is not. Keys only reach us while focus is outside the iframe
 * (Connect UI / float), so callers should also expose clickable controls.
 */
export function iframeHistoryGo(
  iframe: HTMLIFrameElement | null | undefined,
  delta: -1 | 1,
): boolean {
  const win = iframe?.contentWindow;
  if (!win) return false;
  try {
    if (delta < 0) win.history.back();
    else win.history.forward();
    return true;
  } catch {
    return false;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Alt/⌘← → back, Alt/⌘→ → forward; also ⌘/[ and ⌘/]. */
export function isBrowserBackShortcut(e: KeyboardEvent): boolean {
  if (e.key === "ArrowLeft" && (e.altKey || e.metaKey) && !e.shiftKey) {
    return true;
  }
  if (e.key === "[" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
    return true;
  }
  return false;
}

export function isBrowserForwardShortcut(e: KeyboardEvent): boolean {
  if (e.key === "ArrowRight" && (e.altKey || e.metaKey) && !e.shiftKey) {
    return true;
  }
  if (e.key === "]" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
    return true;
  }
  return false;
}

export function useIframeBrowserNav(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  enabled: boolean,
): { goBack: () => void; goForward: () => void } {
  const goBack = useCallback(() => {
    iframeHistoryGo(iframeRef.current, -1);
  }, [iframeRef]);

  const goForward = useCallback(() => {
    iframeHistoryGo(iframeRef.current, 1);
  }, [iframeRef]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (isBrowserBackShortcut(e)) {
        e.preventDefault();
        goBack();
        return;
      }
      if (isBrowserForwardShortcut(e)) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, goBack, goForward]);

  return { goBack, goForward };
}

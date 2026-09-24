import { useEffect, useRef } from "react";
import type { HotkeyCombo, HotkeyId } from "./hotkeys";
import { matchesHotkey } from "./hotkeys";

const STORAGE_KEY = "connect.shortcuts";

/**
 * Reads any user-edited combo for `id` from localStorage, falling back to nothing
 * when no override exists. The hook below prefers the override over the registry default.
 */
function readOverride(id: HotkeyId): HotkeyCombo | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, HotkeyCombo>;
    return map[id] ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether the keystroke belongs to whatever the person is typing into.
 *
 * A combo without a modifier is also just a character: Shift+N is how "New York" starts. A
 * shortcut that fires mid-word steals the letter and throws away the composer the person was
 * writing in, so anything editable — inputs, textareas, contenteditable transcripts — swallows
 * the event as far as un-modified hotkeys are concerned.
 */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * Runs `handler` when the combo for `id` is pressed anywhere on the page.
 *
 * If the user has edited the combo in Settings#shortcuts, this hook picks the override from
 * localStorage at call time (no React state churn, but stored values are reflected immediately).
 * `getHotkey(id)` still supplies the default — its combo only matters when no override exists.
 */
export function useHotkey(
  id: HotkeyId,
  handler: () => void,
  comboOverride?: HotkeyCombo,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const combo = comboOverride ?? readOverride(id);
      if (!combo) return;
      if (!matchesHotkey(event, combo)) return;
      // Plain-character combos (no modifier) are risky mid-word.
      if (!combo.mod && !combo.alt && isEditable(event.target)) return;
      event.preventDefault();
      handlerRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [id, comboOverride]);
}

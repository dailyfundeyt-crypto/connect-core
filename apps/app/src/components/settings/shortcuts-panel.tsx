import {
  IconKeyboard,
  IconRotate,
  IconDeviceFloppy,
  IconAlertTriangle,
  IconCheck,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  HOTKEYS,
  type Hotkey,
  type HotkeyCombo,
  formatHotkey,
  keyOf,
  matchesHotkey,
} from "@/lib/hotkeys/hotkeys";

const STORAGE_KEY = "connect.shortcuts";
const DESKTOP_BRIDGE_KEY = "connect.shortcuts.bridge"; // gespiegelt nach WPF

type ComboMap = Partial<Record<string, HotkeyCombo>>;

function isMacLike(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function sameCombo(a: HotkeyCombo, b: HotkeyCombo): boolean {
  return (
    a.key === b.key &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.mod) === Boolean(b.mod) &&
    Boolean(a.alt) === Boolean(b.alt)
  );
}

function readStoredCombo(id: string): HotkeyCombo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, HotkeyCombo>;
    return map[id] ?? null;
  } catch {
    return null;
  }
}

function writeStoredCombos(map: Record<string, HotkeyCombo>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function postToDesktopBridge(map: Record<string, HotkeyCombo>): void {
  try {
    const w = window as unknown as { chrome?: { webview?: { postMessage: (s: string) => void } } };
    if (!w.chrome?.webview) return;
    const payload = JSON.stringify(Object.fromEntries(
      Object.entries(map).map(([id, c]) => [id, comboToString(c)]),
    ));
    w.chrome.webview.postMessage(
      JSON.stringify({ type: "localstorage", data: { [DESKTOP_BRIDGE_KEY]: payload } }),
    );
  } catch {
    // ignore
  }
}

function comboToString(c: HotkeyCombo): string {
  const parts: string[] = [];
  if (c.mod) parts.push(isMacLike() ? "Cmd" : "Ctrl");
  if (c.alt) parts.push("Alt");
  if (c.shift) parts.push("Shift");
  parts.push(c.key.length === 1 ? c.key.toUpperCase() : c.key);
  return parts.join("+");
}

/**
 * A single shortcut row: click the keycap to record a new combo, then press the keys.
 * Esc cancels recording; Enter / click-outside commits whatever was typed (a printable
 * character alone counts as a single-letter combo).
 */
function ShortcutRow({
  hotkey,
  combo,
  onChange,
  onReset,
  conflict,
}: {
  hotkey: Hotkey;
  combo: HotkeyCombo;
  onChange: (c: HotkeyCombo) => void;
  onReset: () => void;
  conflict: boolean;
}) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onDown = (e: KeyboardEvent) => {
      // Esc → abbrechen
      if (e.key === "Escape") {
        e.preventDefault();
        setRecording(false);
        return;
      }
      // Backspace / Delete → reset to "no combo"
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        onChange({ key: "" });
        setRecording(false);
        return;
      }
      // Tab/Enter wird im Input gebraucht → hier nicht abfangen
      const k = keyOf(e);
      if (k.length === 0) return;
      const next: HotkeyCombo = {
        key: k,
        mod: e.metaKey || e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
      };
      // Wenn nur ein Buchstabe ohne Modifier — typisch wäre das ungewollt;
      // wir lassen es trotzdem zu (der User will das vielleicht).
      e.preventDefault();
      onChange(next);
      setRecording(false);
    };
    window.addEventListener("keydown", onDown, true);
    return () => window.removeEventListener("keydown", onDown, true);
  }, [recording, onChange]);

  const parts = recording ? ["…"] : formatHotkey(combo).length === 0 ? ["ungebunden"] : formatHotkey(combo);

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>{hotkey.label}</ItemTitle>
        <ItemDescription>
          {hotkey.description}
          {conflict && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              <IconAlertTriangle className="size-3" /> Konflikt mit einer anderen Aktion
            </span>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <button
          type="button"
          onClick={() => setRecording((r) => !r)}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
            recording
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
          }`}
          aria-label={`Tastenkürzel für ${hotkey.label} aufnehmen`}
        >
          {parts.map((part, i) => (
            <kbd
              key={`${part}-${i}`}
              className="rounded border bg-background px-1.5 py-0.5 font-sans text-[11px]"
            >
              {part}
            </kbd>
          ))}
          {recording && (
            <span className="ml-1 text-[10px] text-primary">Esc = abbrechen</span>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          aria-label={`${hotkey.label} auf Standard zurücksetzen`}
        >
          <IconRotate className="size-4" />
        </Button>
      </ItemActions>
    </Item>
  );
}

/**
 * Settings#shortcuts — kompletter Editor für alle Hotkey-Definitionen aus `HOTKEYS`.
 * Speichert pro Shortcut-ID in localStorage unter `connect.shortcuts`. Wenn die App
 * im Connect Desktop läuft, spiegelt der Component die Map zusätzlich per
 * window.chrome.webview.postMessage in den WPF-Bridge-Spool, sodass das Native-Window
 * ebenfalls das neue Tastenkürzel verwendet.
 */
export function ShortcutsPanel() {
  const [combos, setCombos] = useState<Record<string, HotkeyCombo>>(() => {
    const map: Record<string, HotkeyCombo> = {};
    for (const h of HOTKEYS) map[h.id] = h.combo;
    return map;
  });
  const [saved, setSaved] = useState(false);

  // Beim Mount: gespeicherte Overrides laden
  useEffect(() => {
    const map = { ...combos };
    let changed = false;
    for (const h of HOTKEYS) {
      const stored = readStoredCombo(h.id);
      if (stored && !sameCombo(stored, h.combo)) {
        map[h.id] = stored;
        changed = true;
      }
    }
    if (changed) setCombos(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Konflikt-Detection: zwei Hotkeys können nicht dieselbe Combo haben
  const conflicts = useMemo(() => {
    const used = new Map<string, string>();
    const set = new Set<string>();
    for (const h of HOTKEYS) {
      const c = combos[h.id];
      if (!c?.key) continue;
      const k = comboToString(c);
      if (used.has(k)) {
        set.add(h.id);
        set.add(used.get(k)!);
      } else {
        used.set(k, h.id);
      }
    }
    return set;
  }, [combos]);

  const handleChange = useCallback((id: string, next: HotkeyCombo) => {
    setCombos((prev) => ({ ...prev, [id]: next }));
    setSaved(false);
  }, []);

  const handleReset = useCallback((id: string) => {
    setCombos((prev) => {
      const def = HOTKEYS.find((h) => h.id === id)?.combo;
      if (!def) return prev;
      return { ...prev, [id]: def };
    });
    setSaved(false);
  }, []);

  const handleResetAll = useCallback(() => {
    const map: Record<string, HotkeyCombo> = {};
    for (const h of HOTKEYS) map[h.id] = h.combo;
    setCombos(map);
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    writeStoredCombos(combos);
    postToDesktopBridge(combos);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }, [combos]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <IconKeyboard className="size-4" />
          Klicke auf ein Feld und drücke die gewünschte Tastenkombination.
          <kbd className="rounded border bg-background px-1 py-0.5 text-[10px]">Esc</kbd>
          {" "}bricht die Aufnahme ab.
        </span>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <IconCheck className="size-3" /> gespeichert
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleResetAll}>
            <IconRotate className="mr-1 size-3.5" /> Alle zurücksetzen
          </Button>
          <Button size="sm" onClick={handleSave}>
            <IconDeviceFloppy className="mr-1 size-3.5" /> Speichern
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {HOTKEYS.map((hotkey, index) => (
          <div key={hotkey.id}>
            <ShortcutRow
              hotkey={hotkey}
              combo={combos[hotkey.id] ?? hotkey.combo}
              onChange={(c) => handleChange(hotkey.id, c)}
              onReset={() => handleReset(hotkey.id)}
              conflict={conflicts.has(hotkey.id)}
            />
            {index !== HOTKEYS.length - 1 && <Separator />}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Tastenkürzel werden lokal in <code className="rounded bg-muted px-1 text-[11px]">localStorage</code>{" "}
        gespeichert. In Connect Desktop werden sie zusätzlich in die WPF-Bridge gespiegelt — der
        Shortcut funktioniert dann sowohl in der WebApp als auch in den nativen Side-Browser-Aktionen.
        Reservierte Browser-Shortcuts wie <kbd className="rounded border bg-background px-1">⌘R</kbd> oder{" "}
        <kbd className="rounded border bg-background px-1">⌘N</kbd> können nicht überschrieben werden.
      </p>
    </div>
  );
}

// Re-export the matcher so app code that wants to honour user overrides can use it.
export { matchesHotkey };

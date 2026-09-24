using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Windows.Input;

namespace ConnectDesktop;

/// <summary>
/// Ein einzelnes Tastenkürzel als serialisierbarer String, z.B. "Ctrl+Shift+B" oder "F11" oder "Esc".
/// Format: <c>Mod1[+Mod2[+Mod3]]+Key</c>. Modifier-Reihenfolge ist normalisiert (Ctrl,Alt,Shift,Win dann Key).
///
/// Wird vom WPF-KeyDown-Handler gelesen und vom WebApp-Settings-Editor geschrieben — beide Seiten
/// sprechen denselben String, sodass das JSON in settings.json ohne Konvertierung hin und her wandert.
/// </summary>
public readonly record struct ShortcutCombo(bool Ctrl, bool Alt, bool Shift, bool Win, Key Key)
{
    public static ShortcutCombo None => default;

    /// <summary>Liefert die Haupt-Taste als normalisierten Buchstaben ("b", "F11", "Escape").</summary>
    public string KeyName => Key switch
    {
        Key.Escape => "Esc",
        Key.Return => "Enter",
        Key.Left => "Left",
        Key.Right => "Right",
        Key.Up => "Up",
        Key.Down => "Down",
        Key.Space => "Space",
        Key.Tab => "Tab",
        Key.Back => "Backspace",
        Key.OemComma => ",",
        Key.OemPeriod => ".",
        Key.OemBackslash => "\\",
        Key.OemMinus => "-",
        Key.OemPlus => "+",
        Key.OemQuestion => "/",
        Key.OemTilde => "`",
        Key.OemOpenBrackets => "[",
        Key.OemCloseBrackets => "]",
        Key.OemQuotes => "'",
        Key.OemSemicolon => ";",
        Key.F1  => "F1",  Key.F2  => "F2",  Key.F3  => "F3",  Key.F4  => "F4",
        Key.F5  => "F5",  Key.F6  => "F6",  Key.F7  => "F7",  Key.F8  => "F8",
        Key.F9  => "F9",  Key.F10 => "F10", Key.F11 => "F11", Key.F12 => "F12",
        >= Key.A and <= Key.Z => ((char)Key).ToString().ToUpperInvariant(),
        _ => Key.ToString(),
    };

    /// <summary>"Ctrl+Shift+B", "F11", "Esc".</summary>
    public override string ToString()
    {
        var sb = new StringBuilder();
        if (Ctrl) sb.Append("Ctrl+");
        if (Alt) sb.Append("Alt+");
        if (Shift) sb.Append("Shift+");
        if (Win) sb.Append("Win+");
        sb.Append(KeyName);
        return sb.ToString();
    }

    /// <summary>Menschliche Form: "Strg + Umschalt + B" auf DE-Tastatur.</summary>
    public string ToHumanDe() => ToHuman("Strg", "Alt", "Umschalt", "Win");

    /// <summary>Menschliche Form generisch (für Tooltips).</summary>
    public string ToHuman(string ctlLabel = "Ctrl", string altLabel = "Alt", string shiftLabel = "Shift", string winLabel = "Win")
    {
        var sb = new StringBuilder();
        if (Ctrl) { AppendPlus(sb); sb.Append(ctlLabel); }
        if (Alt) { AppendPlus(sb); sb.Append(altLabel); }
        if (Shift) { AppendPlus(sb); sb.Append(shiftLabel); }
        if (Win) { AppendPlus(sb); sb.Append(winLabel); }
        AppendPlus(sb);
        sb.Append(KeyName);
        return sb.ToString();
    }

    private static void AppendPlus(StringBuilder sb)
    {
        if (sb.Length > 0) sb.Append(" + ");
    }

    public bool IsSet => Key != Key.None;

    /// <summary>Parst "Ctrl+Shift+B", "F11", "Esc", "Alt+Left" etc. Groß-/Kleinschreibung egal.</summary>
    public static ShortcutCombo Parse(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return None;
        bool ctrl = false, alt = false, shift = false, win = false;
        var parts = raw.Trim().Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Key key = Key.None;
        for (int i = 0; i < parts.Length; i++)
        {
            var p = parts[i].Trim();
            if (p.Length == 0) continue;
            if (i == parts.Length - 1)
            {
                key = ParseKey(p);
            }
            else
            {
                switch (p.ToLowerInvariant())
                {
                    case "ctrl":
                    case "ctl":
                    case "control":
                    case "strg":
                        ctrl = true; break;
                    case "alt": alt = true; break;
                    case "shift":
                    case "shiftkey":
                    case "umschalt":
                        shift = true; break;
                    case "win":
                    case "meta":
                    case "cmd":
                        win = true; break;
                }
            }
        }
        return new ShortcutCombo(ctrl, alt, shift, win, key);
    }

    private static Key ParseKey(string s)
    {
        if (string.IsNullOrEmpty(s)) return Key.None;
        switch (s.ToUpperInvariant())
        {
            case "ESC": case "ESCAPE": return Key.Escape;
            case "ENTER": case "RETURN": return Key.Return;
            case "TAB": return Key.Tab;
            case "SPACE": return Key.Space;
            case "BACKSPACE": case "BACK": return Key.Back;
            case ",": case "OEMCOMMA": return Key.OemComma;
            case ".": case "OEMPERIOD": return Key.OemPeriod;
            case "\\": case "OEMBACKSLASH": return Key.OemBackslash;
            case "/": case "OEMQUESTION": return Key.OemQuestion;
            case "-": case "OEMMINUS": return Key.OemMinus;
            case "+": case "OEMPLUS": return Key.OemPlus;
            case "`": case "OEMTILDE": return Key.OemTilde;
            case "[": case "OEMOPENBRACKETS": return Key.OemOpenBrackets;
            case "]": case "OEMCLOSEBRACKETS": return Key.OemCloseBrackets;
            case "'": case "OEMQUOTES": return Key.OemQuotes;
            case ";": case "OEMSEMICOLON": return Key.OemSemicolon;
        }
        if (s.Length == 1)
        {
            char c = char.ToUpperInvariant(s[0]);
            if (c >= 'A' && c <= 'Z') return Key.A + (c - 'A');
            if (c >= '0' && c <= '9') return Key.D0 + (c - '0');
        }
        if (s.StartsWith("F", StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(s.Substring(1), NumberStyles.Integer, CultureInfo.InvariantCulture, out var f) &&
            f >= 1 && f <= 24)
        {
            return Key.F1 + (f - 1);
        }
        if (Enum.TryParse<Key>(s, true, out var ek)) return ek;
        return Key.None;
    }

    /// <summary>Vergleicht ein WPF-KeyEvent-Args mit diesem Combo (alle Modifier müssen exakt matchen).</summary>
    public bool Matches(KeyEventArgs e)
    {
        if (Key == Key.None) return false;
        if (e.Key != Key) return false;
        return e.Key == Key.Escape
            ? !Ctrl && !Alt && !Shift && !Win  // Escape ohne Modifier
            : (Keyboard.Modifiers & ModifierKeys.Control) != 0 == Ctrl
              && (Keyboard.Modifiers & ModifierKeys.Alt) != 0 == Alt
              && (Keyboard.Modifiers & ModifierKeys.Shift) != 0 == Shift
              && ((Keyboard.Modifiers & ModifierKeys.Windows) != 0
                  || (e.KeyboardDevice?.Modifiers & ModifierKeys.Windows) != 0) == Win;
    }
}

/// <summary>
/// Statische Liste aller editierbaren Shortcuts, mit Defaults und SettingsStore-Keys.
/// Eine Quelle der Wahrheit für WPF-Dispatcher UND WebApp-Settings#shortcuts.
/// </summary>
public static class ShortcutRegistry
{
    public sealed record Entry(string Id, string DefaultCombo, string Label, string Description);

    public static readonly IReadOnlyList<Entry> All = new[]
    {
        new Entry("browser",         "Ctrl+B",      "Side-Browser",        "Side-Browser ein-/ausklappen."),
        new Entry("browser-menu",    "Ctrl+M",      "Browser Menü-Modus",  "Side-Browser über Menü einblenden."),
        new Entry("browser-full",    "Ctrl+F",      "Browser Fullscreen",  "Side-Browser als Vollbild."),
        new Entry("browser-tab",     "Ctrl+Alt+T",  "Browser neuer Tab",   "Neuen Browser-Tab öffnen."),
        new Entry("theme",           "Ctrl+T",      "Theme",               "Dark/Light-Modus umschalten."),
        new Entry("sidebar",         "Ctrl+\\",     "Sidebar",             "App-Sidebar ein-/ausklappen."),
        new Entry("settings",        "Ctrl+,",      "Einstellungen",       "Settings-Panel öffnen."),
        new Entry("focus-input",     "Ctrl+I",      "Chat-Feld fokussieren","Cursor springt in das Chat-Eingabefeld."),
        new Entry("new-chat",        "Ctrl+N",      "Neuer Chat",          "Einen neuen Chat starten."),
        new Entry("reload",          "Ctrl+R",      "Neu laden",           "WebApp neu laden."),
        new Entry("escape",          "Esc",         "Abbrechen",           "Aktuelles Overlay / Eingabe abbrechen."),
        new Entry("history-back",    "Alt+Left",    "Zurück",              "Im Browser-Verlauf zurück."),
        new Entry("history-forward", "Alt+Right",   "Vor",                 "Im Browser-Verlauf vor."),
    };

    /// <summary>Liefert den aktuell aktiven Combo-String aus Settings (oder Default).</summary>
    public static string GetCombo(string id, SettingsStore? store = null)
    {
        store ??= SettingsStore.Instance;
        var entry = All.FirstOrDefault(e => e.Id == id);
        if (entry == null) return "";
        string? fromSettings = store.GetType()
            .GetProperty(ToPropertyName(id))
            ?.GetValue(store) as string;
        return string.IsNullOrWhiteSpace(fromSettings) ? entry.DefaultCombo : fromSettings;
    }

    /// <summary>Setzt den Combo-String in den Settings (validiert mit ShortcutCombo.Parse).</summary>
    public static void SetCombo(string id, string combo, SettingsStore? store = null)
    {
        store ??= SettingsStore.Instance;
        var prop = store.GetType().GetProperty(ToPropertyName(id));
        if (prop == null) return;
        var parsed = ShortcutCombo.Parse(combo);
        prop.SetValue(store, parsed.IsSet ? combo : null);
    }

    private static string ToPropertyName(string id) => "Shortcut" + string.Concat(
        id.Split('-').Select(s => char.ToUpperInvariant(s[0]) + s.Substring(1)));
}

# 006 — Slack-like Sidebar Design

**Datum:** 2026-09-21

## Ziel

UI an die Referenz-Screens anpassen (runde Menüs, Suche + Plus, Sektionen, ruhige Bot-Zeilen), **Unternehmens-Auswahl oben behalten** (bestehende Switcher-Logik).

## Änderungen

- **Tokens** (`styles.css`): weichere Dual-Tone-Sidebar, größeres `--radius` (0.75rem), hellerer Content
- **Sidebar-Breite**: 17.5rem
- **AppSidebar**: Company-Switcher allein im Header; darunter Suche + Plus-Menü (New company / New bot); Sektionen **Pinned** / **Channels**
- **CompanySwitcher**: rundere Trigger/Marks, Dropdown mit `rounded-xl` — Logik unverändert
- **Channel-Zeilen**: `rounded-xl`, Sidebar-Accent als Hover/Active; Context-Menü mit Pin, Copy ID, Delete

## Bewusst nicht

- Keine Ordner/Abschnitte wie in der Referenz (CNT, Lernen…) — dafür fehlt Datenmodell
- Unternehmens-Switcher bleibt Connect-eigener Flow (nicht durch Agent-Dropdown ersetzt)

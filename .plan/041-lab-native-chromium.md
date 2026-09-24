# 041 — Lab braucht echtes Chromium (Connect Desktop / .exe)

## Problem

Browser (Lab) und Unternehmen nutzen heute:

1. ein **iframe** in der Web-UI (kein Chrome, keine Extensions, keine festen Logins), und/oder
2. `POST /open-chrome` → System-Chrome mit Connect-Profil.

Im Cursor-/Cloud-Browser und auf localhost ohne Host-Chrome schlägt der Start fehl.
Bisher: stiller Fallback `window.open` → Tab im normalen Chrome („connecten fehlschlägt“).
Das reicht nicht: wir brauchen **Connect als App auf dem PC** (`Connect.exe` / `START-APP` / Tauri).

## Entscheidung

| Oberfläche | Was sie darf | Was nicht |
| --- | --- | --- |
| Web (localhost / Cloud-Preview) | Sidebar, Tabgruppen, Cloud-Sync, klare Desktop-Hinweis-UX | Kein stiller Tab im System-Chrome; kein „als wäre Chromium drin“ |
| Connect Desktop (`.exe` / START-APP / Tauri) | Host-Chrome mit Connect-Profil (`--user-data-dir`), Extensions, Google-Login | — |
| Später (Tauri/Electron) | Optional: Lab-Pane als BrowserView / gesteuertes Chromium im Fenster | Nicht in dieser Iteration als CEF neu bauen |

## Umsetzung (diese Iteration)

1. **Kein `window.open`-Fallback** mehr bei Chrome-Start-Fehler.
2. Klare Meldung: **Connect Desktop** (`Connect.exe` / `./START-APP.sh`) nötig.
3. **Browser (Lab)** bekommt dieselben Connect-Chrome / Extensions-Tools wie Unternehmen.
4. `open-chrome` sucht Host-Chrome (Linux + Windows-unter-WSL), kein Fake-`ok` über `xdg-open`.
5. Docs: `DESKTOP-PC.md` — Lab = Desktop-Pfad.

## Nächster Schritt (nicht hier)

Tauri-Command `lab_open_url` der Chrome/Edge mit Connect-Profil auf dem PC startet und Lab-Pane an Desktop-Host koppelt — ohne Web-Fallback.

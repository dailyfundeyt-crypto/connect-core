# 053 — Cloud-Picker vollständig + Connect-Chrome Startpfad

## Stefan-Anforderungen (Priorität)

1. **Cloud-Picker** zeigt wieder alle Zeilen (nicht nur Manus):
   - Default Cloud · Azure Cloud · Oracle Cloud (~24 GB Anchor large) · Manus Cloud
   - plus PC (Ubuntu-Docker), Smartphone, Chrome Browser
   - Fehlender Anchor-/Manus-Key → Zeile grau + Hinweis „unter Agent → API-Keys hinterlegen“ — Zeile bleibt sichtbar
2. **Connect-Chrome** darf nie still scheitern: Start von Host-Chrome mit Connect-Profil **oder** sichtbarer Fehler inkl. Startpfad.
3. Branch auf Stefans PC Connect (:3010) ziehen — siehe unten.

## Was geändert wurde

| Bereich | Änderung |
| --- | --- |
| `agent-computer.ts` / `agent-browser-mode.tsx` / `agent-browser-menu.tsx` / Composer+ | `SANDBOX_PICKER_OPTIONS` mit Default/Azure/Oracle/Manus |
| Settings → Ubuntu | Maschinenliste wieder (`ubuntu-machines-settings.tsx`) |
| `level-chrome-sidebar` Connect-Chrome | Async-Start, Busy-State, Success/Error-Text im Menü |
| `lab-prefs` + `open-chrome` | Klarer Fehler + `CHROME_START_PATH_HINT`; Spawn prüft Binary und Early-Exit |
| Tests | `cloud-picker-restore.test.ts` |

Basis-Restore: `cursor/restore-azure-oracle-default-cloud-9d88` (`7cf4810`), auf `cursor/sandbox-manus-hilfe-2342` übernommen.

## Connect-Chrome — erwartetes Verhalten

- Klick → `POST /api/connect/open-chrome` → Host Chrome/Edge mit `--user-data-dir=…/.connect-chrome-profile/…`
- Erfolg → Menü: „Connect-Chrome gestartet…“
- Misserfolg → Menü zeigt Server-Fehler + Startpfad (kein Silent-No-Op)

**Startpfad auf dem PC:** `./START.sh` (UI :3010) + `./START-APP.sh` bzw. `Connect.exe`. Host-Chrome muss für den API-Prozess erreichbar sein (`CONNECT_CHROME_BIN` optional). Ubuntu-Sandbox / Bot-Computer (`agent-computer` :4100) ist ein **anderer** Pfad (Runtime „PC“) — bei headed-Browser dort Supervisor/Docker prüfen.

## Branch auf Stefans PC Connect (:3010)

```bash
cd /pfad/zu/Connect   # bzw. Repo-Root mit Connect/
git fetch origin
git checkout cursor/sandbox-manus-hilfe-2342
git pull origin cursor/sandbox-manus-hilfe-2342
./START.sh            # oder scripts/start.sh — UI auf http://127.0.0.1:3010
# optional Desktop-Fenster:
./START-APP.sh
```

Danach im UI: Computer-Picker auf Default/Azure/Oracle/Manus prüfen; Benutzer-Menü → **Connect-Chrome** — Fenster oder Fehlermeldung.

# dist-Backups (Connect.INK / Port 3101)

Lokale Übersicht. **Nicht committen** — steht in keinem Workflow, gehört dir.

## Was das ist

Beim Bauen von Connect.INK (Port 3101) wird nicht in `apps/app/dist` gebaut,
sondern der fertige Build von dort hierhin gespiegelt:

```
apps/app/dist                                        <- Quelle (wird gebaut)
  -> apps/connect-app/runtime/connect/apps/app/dist   <- Ziel (wird ausgeliefert)
```

Port 3101 kennt **keinen Quellcode**. Er serviert ausschliesslich `dist/`. Deshalb
sahen Helium (3010) und Connect.INK (3101) unterschiedlich aus, sobald an
`apps/app` weiter gearbeitet wurde. Ein `git push aendert daran nichts` — der
Unterschied entsteht ausschliesslich durch einen fehlenden oder veralteten Build.

Alle sechs Ordner liegen unter
`apps/connect-app/runtime/connect/apps/app/`.

## Bestand (Stand 2026-10-05 18:18)

| Ordner | Zeitstempel | Groesse | Grund |
|---|---|---|---|
| `dist.bak-helium-gdrive-20261004-142706` | 2026-10-04 14:21 | 52.9 MB | vor GDrive-Sync nach Helium |
| `dist.bak-pre-company-fixes-20261004-162958` | 2026-10-04 16:29 | 52.9 MB | vor Company-Fixes, erster Versuch |
| `dist.bak-pre-refresh-20261004-1925` | 2026-10-04 16:37 | 52.9 MB | vor Refresh-Arbeit |
| `dist.bak-pre-company-fixes-20261004-163713` | 2026-10-04 16:37 | 60.7 MB | vor Company-Fixes, zweiter Versuch |
| `dist.bak-pre-diagnose-20261004-1958` | 2026-10-04 19:14 | 52.8 MB | vor Diagnose-Arbeit |
| `dist.bak-preside-20261005-181846` | 2026-10-05 18:18 | 52.9 MB | vor Sync von 3010 auf 3101 (heute) |

Summe: rund **325 MB**.

## Auffaellig: `pre-company-fixes-20261004-163713` hat 612 Dateien

Die anderen haben 522. Der Unterschied sind 179 Dateien unter `assets/` mit
**zwei Hash-Varianten je Chunk** (`abnfDiagram-VCTEODGH-9JDGio0I.js` *und*
`abnfDiagram-VCTEODGH-Cp1LqNEf.js` usw.).

Das ist kein Rechenfehler, sondern ein halbfertiger Build: es wurden zwei
Bundles uebereinander kopiert, ohne dass der aeltere Stand entfernt wurde. Wer
ihn als "bekannt gut" verwendet, bekommt womoeglich uralte Chunks neben neuen.

## Git-Ignore — bereits erledigt

**Es ist nichts nachzutragen.** Geprueft mit `git check-ignore -v`:

```
.gitignore:112:apps/connect-app/runtime/
```

`.gitignore` Zeile 112 deckt `apps/connect-app/runtime/` als ganzes ab, und damit
auch alle `dist.bak-*` darin. Gegenprobe: in `git status` erscheint keiner der
Ordner. Zeile 119 zusaetzlich noch ein generisches `dist/`.

Ein eigenes `dist.bak-*`-Muster waere also **redundant**. Es haette nur eine
Schein-Sicherheit erzeugt, die es nicht gibt.

## Was weg kann — Freigabe ausstehend

Nichts geloescht. Vorschlag zur Freigabe, nach Zeitstempel sortiert:

```powershell
cd "C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium\apps\connect-app\runtime\connect\apps\app"

# Die drei aeltesten vom 04.10. — alle vor der Diagnose-/Company-Fix-Runde
Remove-Item "dist.bak-helium-gdrive-20261004-142706"     -Recurse -Force
Remove-Item "dist.bak-pre-company-fixes-20261004-162958" -Recurse -Force
Remove-Item "dist.bak-pre-refresh-20261004-1925"         -Recurse -Force
```

Das spart rund 159 MB und behaelt drei Ordner:

- `pre-company-fixes-...-163713` — der letzte vor der Diagnose-Runde
- `pre-diagnose-...` — direkt vor der Diagnose-Runde
- `preside-...` — der heutige Stand

**Vorher pruefen, ob einer davon die letzte funktionierende Version vor einem
grösseren Change ist.** Das laesst sich aus dem Dateisystem nicht mehr
feststellen — nur du weisst es.

## Aufräum-Skript

`scripts/cleanup-dist-backups.ps1` — **Vorschau per Default, löscht nur mit `-Apply`.**

```powershell
# nur ansehen (Standard) — loescht nichts
.\scripts\cleanup-dist-backups.ps1

# neueste 2 behalten, Rest loeschen
.\scripts\cleanup-dist-backups.ps1 -Apply -Keep 2

# nur was aelter als 7 Tage ist, neuester bleibt
.\scripts\cleanup-dist-backups.ps1 -Apply -Keep 1 -OlderThanDays 7
```

Zwei unabhaengige Schutzregeln, beide muessen ausfallen damit etwas geloescht wird:

1. **`good` im Namen** — von Hand als funktionierend markiert, wird nie angefasst
2. **unter den `-Keep` neuesten** — der Stand, aus dem man zurueck kann

Nach dem Test mit `-Keep 2` (Stand 05.10. 18:18):

```
[ behalten ]  dist.bak-preside-20261005-181846            52,9 MB   neueste 2
[ behalten ]  dist.bak-pre-diagnose-20261004-1958         52,8 MB   neueste 2
[ LOESCHEN ]  dist.bak-pre-refresh-20261004-1925          52,9 MB
[ LOESCHEN ]  dist.bak-pre-company-fixes-20261004-163713  60,7 MB
[ LOESCHEN ]  dist.bak-pre-company-fixes-20261004-162958  52,9 MB
[ LOESCHEN ]  dist.bak-helium-gdrive-20261004-142706      52,9 MB
```

**Es ist nichts geloescht worden.** Der Aufruf mit `-Apply` wartet auf deine
Entscheidung.

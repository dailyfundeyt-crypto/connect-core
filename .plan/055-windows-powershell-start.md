# 055 — Windows PowerShell: kein Connect-Ordner / kein git / kein .sh

## Symptom (Stefan)

```
cd Connect          → Pfad nicht gefunden (C:\Users\…\Connect fehlt)
git pull …          → git nicht erkannt
./START.sh          → in PowerShell kein Bash-Befehl
```

## Ursache

Linux-Clone-Befehle wurden in **Windows-PowerShell** ausgeführt. Ohne installiertes Git und ohne lokalen Projektordner schlagen sie fehl. `.sh` braucht WSL oder Git Bash.

## Fix (Doku + Helper)

| Datei | Zweck |
| --- | --- |
| [WINDOWS.md](../WINDOWS.md) | PowerShell-Erste-Hilfe (Downloads\Connect, winget Git, WSL) |
| `START.ps1` | Sucht Connect-Ordner / Connect.exe, startet `START-APP.cmd`, sonst deutsche Fehlerhilfe |
| [DESKTOP-PC.md](../DESKTOP-PC.md) | Windows-Abschnitt zuerst: `.\START-APP.cmd`, Stack nur in WSL |

## Was Stefan jetzt tun soll

1. Prüfen: `Test-Path "$env:USERPROFILE\Downloads\Connect\START-APP.cmd"`
2. Wenn ja: `cd …\Downloads\Connect` → `.\START-APP.cmd`
3. Wenn nein: `winget install Git.Git`, Repo klonen, Stack in WSL, dann `START-APP.cmd`
4. Oder `Connect.exe` doppelklicken (wenn vorhanden)

Connect bleibt der Browser (Plan 054) — `START-APP.cmd`, nicht Website-Tab.

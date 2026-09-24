# Connect auf Windows (PowerShell) — Erste Hilfe

Die Linux-Befehle (`cd Connect`, `git pull`, `./START.sh`) funktionieren **nicht**
in Windows-PowerShell, wenn:

- der Ordner `Connect` unter deinem Benutzerprofil fehlt,
- `git` nicht installiert ist,
- `.sh`-Dateien ohne WSL/Git-Bash laufen sollen.

Beispiel-Fehler: `C:\Users\Kunc GmbH\Connect` nicht gefunden, `git` nicht erkannt,
`./START.sh` kein Cmdlet.

## Natives Programmfenster (kein Browser)

Stand dieses PCs: kein `Connect`-Ordner, kein `connect-app`, keine `Connect.exe`
auf Desktop, in Dokumenten oder in Downloads. WSL hat keine Distribution.

Checkliste, ohne WSL für das Fenster:

1. Git installieren (`winget install --id Git.Git -e`), PowerShell neu öffnen.
2. Den Branch aus dem Pull Request klonen (URL steht im PR), nicht einen
   Desktop-Ordner erwarten.
3. Bun und Rust auf Windows installieren. WebView2 ist auf Windows 10/11 meist da.
4. Im Clone, Ordner `Connect`:

```powershell
cd .\Connect
powershell -ExecutionPolicy Bypass -File .\START-CONNECT.ps1 -Dev
```

Das öffnet das Fenster **Connect** ohne Adressleiste. WSL ist dafür nicht nötig.
Die volle Oberfläche erscheint erst, wenn Docker und WSL laufen und `START.sh`
den Dienst hebt. Bis dahin bleibt der Startbildschirm, auch wenn 3010/3001
durch Cursor belegt sind.

Eine `.exe` entsteht erst nach `bun run connect:package` **auf diesem PC**
(oder als CI-Artefakt `connect-windows-nsis` nach dem Workflow). Sie liegt
nicht schon auf dem Desktop.

Details: [DESKTOP-PC.md](./DESKTOP-PC.md).

## Sofort in PowerShell ausführen

```powershell
# 1) Schon entpackt?
Test-Path "$env:USERPROFILE\Downloads\Connect\START-APP.cmd"
Test-Path "$env:USERPROFILE\Downloads\Connect.exe"

# 2) Git?
Get-Command git -ErrorAction SilentlyContinue
```

### A) `Downloads\Connect` existiert → Connect-Browser starten

```powershell
cd "$env:USERPROFILE\Downloads\Connect"
.\START-APP.cmd
```

Oder Helper:

```powershell
cd "$env:USERPROFILE\Downloads\Connect"
powershell -ExecutionPolicy Bypass -File .\START.ps1
```

### B) `Connect.exe` in Downloads → Doppelklick

```powershell
explorer "$env:USERPROFILE\Downloads"
```

`Connect.exe` doppelklicken. Entpackt nach `Downloads\Connect`, startet Stack über WSL,
öffnet Connect-Browser (Chrome/Edge + Profil).

### C) Noch nichts da → Git + Docker/WSL

```powershell
winget install --id Git.Git -e --source winget
winget install --id Docker.DockerDesktop -e --source winget
```

PowerShell **schließen und neu öffnen**. Projekt-Clone (URL aus Cursor „Create repo“,
sobald das Repo für dich erreichbar ist):

```powershell
cd $env:USERPROFILE
git clone <REPO-URL> connect-src
cd .\connect-src\Connect
```

Stack **nur in WSL** (Pfad anpassen; Leerzeichen im Namen in Anführungszeichen):

```powershell
wsl -e bash -lc "cd '/mnt/c/Users/Kunc GmbH/connect-src/Connect' && curl -fsSL https://bun.sh/install | bash && export PATH=`$HOME/.bun/bin:`$PATH && bun install && CONNECT_FORCE_START=1 ./START.sh"
```

Danach Connect-Browser:

```powershell
cd "$env:USERPROFILE\connect-src\Connect"
.\START-APP.cmd
```

## Was in PowerShell nicht geht

| Befehl | Warum |
| --- | --- |
| `cd Connect` vom Home | Ordner fehlt oft |
| `git …` ohne Installation | nicht im PATH |
| `./START.sh` / `./START-APP.sh` | Bash → nutze `.\START-APP.cmd` oder WSL |

## Voraussetzungen

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) mit **WSL2**
- Bun **in WSL**
- Chrome oder Edge auf Windows

Connect ist der Browser: `START-APP.cmd` = Host-Chrome/Edge mit Profil  
`%USERPROFILE%\.connect-chrome-profile\desktop` — kein Website-Tab.

Siehe auch [DESKTOP-PC.md](./DESKTOP-PC.md).

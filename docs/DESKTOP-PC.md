# Connect als App auf dem PC

Das Programmfenster ist **Tauri**: normale Windows-Titelleiste, Titel **Connect**,
dieselbe Connect-Oberfläche wie der lokale Dienst. **Keine Adressleiste**, kein
localhost in der Titelleiste, kein Chrome/Edge-Fenster.

Host-Chrome (`START-APP`) bleibt ein separater Start und ist **nicht** dieses
Programmfenster. Ein Browser-Tab in der App ist hier nicht enthalten.

## Natives Fenster (Step 1)

Auf DESKTOP-KA3V060 liegt **kein** Ordner `Connect`, **kein** `connect-app` und
**keine** `Connect.exe` (Desktop, Dokumente, Downloads geprüft). Die Dateien
kommen nur über den Pull-Request-Branch.

Das **Fenster** startet ohne WSL: Bun, Rust, WebView2.  
Die **volle Oberfläche** braucht Docker und WSL (`START.sh`). WSL ist auf diesem
PC nicht installiert (`wsl` meldet keine Distribution). `wsl.exe` wird dann
nicht aufgerufen. Ein Cursor-Port auf 3010/3001, der keine Antwortbytes liefert,
ist kein laufender Dienst und füllt das Fenster nicht.

`START-CONNECT.cmd` liegt im Clone unter `Connect\START-CONNECT.cmd`, nicht unter
`Connect\connect-app`.

### Entwicklung

```bash
cd Connect/desktop
bun install
bun run connect
```

Oder vom Connect-Ordner: `./START-CONNECT.sh` / `.\START-CONNECT.cmd`.

### Installer auf Stefans Windows-PC

Nur Windows kann die `.exe` bauen (WebView2, MSVC, NSIS). In **PowerShell** oder
cmd, im geklonten `Connect`:

```powershell
cd desktop
bun install
bun run connect:package
```

Ergebnis:

`desktop\src-tauri\target\release\bundle\nsis\Connect_*_x64-setup.exe`

Doppelklick installiert **Connect**. Danach Startmenü → **Connect**, oder die
ungepackte Binary:

`desktop\src-tauri\target\release\connect-desktop.exe`

`.\START-CONNECT.cmd` startet die Binary, wenn sie schon gebaut wurde, sonst
`bun run connect`.

Schließen des Fensters beendet das Programm und lässt den lokalen Dienst laufen.
Log, falls der Dienst nicht hochkommt: `Connect\.logs\connect-desktop.log`.

### CI

Ein Linux-Agent kann diese Windows-`.exe` nicht erzeugen. Der Workflow
`.github/workflows/desktop.yml`, Job **connect-windows** (`windows-latest`),
baut sie und lädt `connect-windows-nsis` hoch. Der bestehende Job **app
(windows)** baut weiter den Setup-Assistenten, nicht dieses Produktfenster.

---

Host-Chrome/Edge mit Connect-Profil bleibt für den separaten Browser-Start
(`START-APP`). Das ist kein Ersatz für das Programmfenster oben.

---

## Windows PowerShell — wenn `cd Connect` / `git` / `./START.sh` scheitern

Das ist normal: unter `C:\Users\…\` liegt oft **kein** Ordner `Connect`, und
PowerShell kennt weder `git` noch Bash-Skripte (`.sh`).

**Kurz-Anleitung:** [WINDOWS.md](./WINDOWS.md) · Helper: `.\START.ps1`

```powershell
# Clone mit dem nativen Fenster:
cd "$env:USERPROFILE\connect-src\Connect"
.\START-CONNECT.cmd

# Helper (sucht den Ordner, startet das native Fenster wenn START-CONNECT.cmd da ist):
# powershell -ExecutionPolicy Bypass -File .\START.ps1
```

Ohne Projektordner zuerst **Git** (und danach Clone) oder **Connect.exe** nutzen — siehe WINDOWS.md.  
Stack (`START.sh`) läuft unter Windows über **WSL**, nicht direkt in PowerShell.

---

## 0) Windows: eine `.exe` (Downloads)

Auf dem Build-Rechner (Linux oder Windows mit Bun):

```bash
cd Connect
bash packaging/build-windows-exe.sh ~/Downloads
```

Ergebnis: **`Downloads/Connect.exe`** (~110 MB, echtes Windows-PE).

Auf dem Windows-PC:

1. Doppelklick auf `Connect.exe`
2. Das Projekt wird nach **`%USERPROFILE%\Downloads\Connect`** entpackt
3. Stack startet über **WSL** (`./START.sh`), **Connect-Browser** öffnet sich (Chrome/Edge + Connect-Profil)
4. **Enter** (oder Fenster schließen) → `scripts/stop.sh` — Connect deaktiviert sich

Voraussetzungen auf Windows: [Docker Desktop](https://www.docker.com/products/docker-desktop/) mit WSL2, [Bun](https://bun.sh) in WSL, Chrome oder Edge.

### Warum Connect der Browser ist

Ein Web-Tab oder iframe kann **kein** Chromium mit Extensions und festen Logins sein.  
Lab öffnet URLs über `POST /api/connect/open-chrome` im Host-Chrome mit Connect-Profil.  
`.\START-APP.cmd` / `Connect.exe` starten genau dieses Fenster — mit Browser-Chrome, nicht `--app=`.

## 1) Schnell: Connect-Browser starten

### Windows (PowerShell / cmd)

Voraussetzung: Ordner mit `START-APP.cmd` (Clone oder `Downloads\Connect`).

```powershell
cd "$env:USERPROFILE\Downloads\Connect"   # oder dein Clone\Connect
.\START-APP.cmd
```

Optional Start-URL (Steuerung-Tab im Connect-Browser):

```bat
START-APP.cmd http://127.0.0.1:3010
```

Den **Stack** (API/UI) startest du in **WSL**, nicht mit `./START.sh` in PowerShell:

```powershell
wsl -e bash -lc "cd '/mnt/c/Users/DEINNAME/…/Connect' && CONNECT_FORCE_START=1 ./START.sh"
```

### macOS / Linux

```bash
cd Connect
bun install
./START.sh
chmod +x ./START-APP.sh
./START-APP.sh
```

Chrome oder Edge muss installiert sein. Profil-Standard:
`~/.connect-chrome-profile/desktop` (überschreibbar mit `CONNECT_CHROME_PROFILE`).

---

## 2) Echte Desktop-App (Tauri)

Unter `desktop/` liegt die native **Connect**-Desktop-App (Tauri). Sie richtet Engine/Stack ein und hält ihn am Laufen; Browser-Sessions laufen weiter über Host-Chrome + Connect-Profil (Plan 041 / 054).

Voraussetzungen: Bun, Rust (`rustup`), auf Windows zusätzlich WebView2 (meist schon da).

```bash
cd Connect/desktop
bun install
bun run tauri dev          # Entwicklung mit Fenster
bun run tauri build        # Installer: .exe (NSIS) / .dmg / .AppImage
```

Gebaute Installer liegen unter `desktop/src-tauri/target/release/bundle/`.

Details zu Signierung und Versionen: `docs/releasing.md`, `docs/windows-signing.md`.

---

## Tipps

- Standard-Ports laut `START.sh`: API `3001`, App `3010`.
- Ohne API-Keys startet der Stack nur mit `CONNECT_FORCE_START=1` (eingeschränkt).
- Lab-Engine-Standard ist **`full`** (Connect-Chrome). Iframe ist nur optionale Vorschau (`embed`).
- Cloud-Preview / Cursor-Browser allein reichen nicht für Extensions — Connect muss auf dem PC laufen.
- Benutzernamen mit Leerzeichen (z. B. `Kunc GmbH`): Pfade in PowerShell/WSL immer in Anführungszeichen.

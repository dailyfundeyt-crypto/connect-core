# Step 1 — Natives Windows-Fenster (Connect)

Dateiname wie angefordert. Im Index als **056**, weil 053–055 schon andere Notizen sind.

## Stack

**Tauri 2** im bestehenden `Connect/desktop/`. Kein Electron. Kein Browser-Chrome,
kein WebView2-Dual-Tab, kein EinfacherBrowser, kein Agent neben einem Browser.

Das Fenster hat eine normale Titelleiste, Titel **Connect**, Dekorationen an
(minimieren, maximieren, schließen) und **keine Adressleiste**. Der Inhalt ist
dieselbe Connect-Oberfläche, die der lokale Dienst ausliefert. Der Dienst bleibt
intern; die Oberfläche zeigt keine URL.

| Stück | Rolle |
| --- | --- |
| `desktop/src-tauri/tauri.connect.conf.json` | Produktfenster: Titel Connect, 1440×900, Startseite `connect-shell.html`, `withGlobalTauri` |
| `desktop/public/connect-shell.html` | Kurzer Startbildschirm, bis die Oberfläche da ist |
| `desktop/src-tauri/src/connect_window.rs` | Nur Loopback, keine Adresse im Text |
| `desktop/src-tauri/src/connect_product.rs` | Navigiert das Fenster, startet bei Bedarf `START.sh` |
| `bun run connect` / `bun run connect:package` | Dev-Fenster bzw. Installer |

Der bisherige Setup-Assistent (`bun run tauri dev` ohne `connect`) bleibt.
`START-APP.cmd` öffnet weiter Host-Chrome und ist **nicht** dieses Fenster.

## Was sich ändert

- Produktmodus über `CONNECT_PRODUCT_WINDOW=1`, `--connect`, oder das
  Compile-Flag aus `connect:package`.
- Das Fenster lädt die Connect-UI, sobald der App-Port antwortet (Standard 3010).
  Es navigiert nur zu `127.0.0.1` oder `[::1]`.
- Läuft der Dienst noch nicht und WSL hat eine Distribution, startet das Fenster
  `START.sh` über WSL. Ohne Distribution wird `wsl.exe` nicht aufgerufen.
  Abschalten mit `CONNECT_AUTOSTART=0`.
- Ein offener Port reicht nicht. Nur eine Antwort mit `<title>Connect</title>`
  wird ins Fenster geladen. Ein hängender Cursor-Forward (0 Bytes) bleibt draußen.
- Schließen beendet das Programm und fährt den Dienst **nicht** herunter
  (der Assistent macht beim Quit weiter Compose-down).
- Kontextmenü ohne Browser-Befehle (Zurück, Speichern unter) bleibt, wie im
  bestehenden Shell.

## Stefans PC (DESKTOP-KA3V060)

Geprüft: kein `Connect`, kein `connect-app` unter Desktop, Dokumente, Downloads.
WSL ohne Distribution. 3010/3001 können durch Cursor belegt sein und trotzdem
keine HTTP-Antwort liefern. `Connect\connect-app\START-CONNECT.cmd` existiert
dort nicht. Die Datei im Repo ist `Connect\START-CONNECT.cmd`.

Es gibt keine fertige `Connect.exe` auf dem Desktop. Dieser Agent baut sie
nicht (Linux).

### Checkliste

1. Repo über den Pull Request ziehen (Clone oder `git fetch` + Checkout von
   `cursor/native-windows-connect-11dc`).
2. Auf Windows, ohne WSL: Bun, Rust (`rustup`), WebView2.
3. Im Clone:

```powershell
cd .\Connect
powershell -ExecutionPolicy Bypass -File .\START-CONNECT.ps1 -Dev
```

Das Fenster öffnet sich. Die volle Oberfläche braucht danach Docker und WSL;
ohne WSL bleibt der Startbildschirm und sagt das.

Installer, erst wenn das Fenster steht und Bun/Rust da sind:

```powershell
cd .\desktop
bun install
bun run connect:package
```

Ergebnis lokal: `desktop\src-tauri\target\release\bundle\nsis\Connect_*_x64-setup.exe`.

## Start auf Stefans PC

Entwicklung, wenn der Clone schon da ist:

```powershell
cd Connect\desktop
bun install
bun run connect
```

Installer (nur auf Windows — WebView2, MSVC-Linker, NSIS):

```powershell
cd Connect\desktop
bun install
bun run connect:package
```

Die Setup-Datei:

`desktop\src-tauri\target\release\bundle\nsis\Connect_*_x64-setup.exe`

Doppelklick installiert **Connect**. Startmenü → Connect.
Ohne Installer, nach dem Build:

`desktop\src-tauri\target\release\connect-desktop.exe`

Oder `.\START-CONNECT.cmd` / `./START-CONNECT.sh` (Binary, sonst Dev-Fenster).

Bun, Rust (`rustup`), auf Windows WebView2 — das reicht für das leere Fenster.
Die volle Oberfläche braucht Docker und eine WSL-Distribution. Ohne die bleibt
der Startbildschirm. Log, falls ein Start versucht wurde: `Connect\.logs\connect-desktop.log`.

## CI / dieser Cloud-Agent

Dieser Agent läuft unter **Linux**. Hier entsteht **keine** Windows-`.exe`
(`tauri build` für NSIS braucht einen Windows-Runner).

Im Repo baut der Job **connect-windows** in
`.github/workflows/desktop.yml` auf `windows-latest`:

```powershell
cd desktop
bun install --frozen-lockfile
bun run connect:package
```

Artefakt: **connect-windows-nsis** (`bundle/nsis/*.exe`).

Der Job **app (windows)** im selben Workflow bleibt der Setup-Assistent
(`bun run tauri build` ohne Produkt-Flag).

## Nicht in diesem Schritt

Browser-Komponente, Chromium-Panel, EinfacherBrowser, Agent neben dem Browser.

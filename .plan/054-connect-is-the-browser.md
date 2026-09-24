# 054 — Connect IST der Browser (kein Website-in-Tab)

## Stefan-Korrektur

Falsch: Produkt als Website in einen Browser packen (`--app=http://…`, iframe als „Chrome“, Cloud-Preview-Tab als Deliverable).  
Richtig: **Die Sache, die wir codieren, wird der Browser** — Host-Chrome/Edge mit Connect-Profil (Tabs, Extensions, Logins).

## Entscheidung

| Oberfläche | Rolle |
| --- | --- |
| Connect-Chrome (`engine: full`, Default) | **Der Browser** — `open-chrome` / `START-APP` mit `--user-data-dir=…/.connect-chrome-profile/…` |
| Lab-Pane in der UI | Steuerung/Status — **kein** iframe-Surfen |
| `engine: embed` | Nur optionale Vorschau, klar als Nicht-Browser gekennzeichnet |
| Web-Tab ohne Desktop | Hinweis + Startpfad — kein stiller System-Tab |

## Umsetzung

1. Lab-Default `engine: full` (`resolveLabEngine`).
2. `Level3SiteStudio`: bei `full` Connect-Chrome-Pane (Start/Status), kein iframe.
3. `START-APP.sh` / `.cmd` / `Connect.exe`-Launcher: **kein** `--app=` — echtes Browserfenster mit Connect-Profil; Steuerung-URL als erster Tab.
4. Docs: `DESKTOP-PC.md` anpassen.

## Start auf dem PC

```bash
cd Connect
./START.sh
./START-APP.sh    # Connect-Browser (Profil), nicht Website-Fenster
```

Lab → App wählen → Host-Chrome öffnet die URL im Connect-Profil.

## Bezug

- [041](./041-lab-native-chromium.md) — Desktop vs Web
- [053](./053-connect-chrome-and-cloud-picker.md) — open-chrome Startpfad

# 052 — Default Cloud, Azure Cloud, Oracle Cloud

## Was der Picker wieder zeigt

Im Menü **Cloud · Smartphone** (Details und Agent-Einstellungen) stehen die Zeilen wieder untereinander. Fehlende Keys grauen eine Zeile nur aus — sie verschwindet nicht.

| Option | Runtime | Start |
| --- | --- | --- |
| **Default Cloud** | `cloud` + `cloudTarget: default` | Dieselbe Anchor-Remote-Box, kleine Box (`boxSize: small`) |
| **Azure Cloud** | `cloud` + `cloudTarget: azure` | Plan 049: Anchor-Remote-Box, mittlere Box. Kein zweites Control-Plane. |
| **Oracle Cloud** | `cloud` + `cloudTarget: oracle` | Dieselbe Anchor-Session mit `boxSize: large` (~24 GB). Kein Oracle-Konto und kein OCI-Key. |
| **Manus Cloud** | `manus` | Bleibt. Vorher im Picker „Default Claude“ genannt. |
| **PC (Ubuntu-Docker)** | `local` | Supervisor-Container auf diesem Rechner |
| **Smartphone** | `phone` | ADB / scrcpy, unverändert |
| **Chrome Browser** | `chrome` | Host-Chrome, unverändert |

Eine gespeicherte Cloud-Box `large` ohne `cloudTarget` gilt weiter als Oracle (alter „Groß / Oracle“-Pfad).

## Was zum Starten fehlt

Oracle 24 GB und Default/Azure starten über `POST /api/anchor/sessions` mit dem Agent-Key **Browser Use (Anchor)**.

Ohne diesen Key: Zeile sichtbar, ausgegraut, Hinweis „Noch kein Anchor-Key — unter Agent → API-Keys hinterlegen.“

Manus Cloud braucht weiter `MANUS_API_KEY` bzw. den Manus-Key des Agenten. Ohne Key dieselbe Grau-Zeile.

## Settings

**Settings → Ubuntu** listet wieder die lokalen Ubuntu-Maschinen (ein Eintrag pro Bot, Status aus `/api/computers/fleet` wenn lesbar). **Starten** setzt die Runtime auf PC (Ubuntu-Docker) und weckt den Container. Oracle 24 GB startet nicht über diese Liste, sondern über Oracle Cloud im Picker.

## Basis

Der Details-Picker aus dem Screenshot (Default Claude · Azure · Smartphone) liegt auf `cursor/sandbox-manus-hilfe-2342`. Diese Notiz setzt dort an, damit Manus Hilfe, Smartphone und PC erhalten bleiben.

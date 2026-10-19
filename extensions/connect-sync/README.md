# Connect Sync (Helium-Erweiterung)

Verbindet Helium beim Start automatisch mit der lokalen Connect App (http://127.0.0.1:3101).
Tabs/Fenster gehen live an Connect, Connect spiegelt sie über die Handy-Brücke (Supabase) in die
Handy-Version: Einstellungen › „Mein Helium“. Befehle vom Handy: Tab öffnen, schließen, aktivieren,
neu laden, navigieren, Fenster fokussieren, optional Screenshot.

## Einmal laden
1. In Helium `helium://extensions` (oder `chrome://extensions`) öffnen.
2. Oben rechts „Entwicklermodus“ einschalten.
3. „Entpackte Erweiterung laden“ → diesen Ordner wählen:
   `C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium\extensions\connect-sync`
Fertig. Die Kopplung passiert automatisch (kein Login).

## Sicherheit
- Spricht nur mit 127.0.0.1:3101 (fest im Code, host_permissions nur dafür).
- Kopplung: Connect erzeugt einmal ein Token (`%LOCALAPPDATA%\ConnectApp\data\helium-sync.json`) und gibt es
  nur an eine `chrome-extension://`-Herkunft über Loopback heraus; die erste Erweiterungs-ID wird gemerkt.
  Zurücksetzen: Datei löschen, Connect neu starten, Erweiterung „Neu verbinden“.
- Keine Ausführung von Code in Webseiten; Befehle sind auf die Liste oben beschränkt, URLs nur http(s).
- Befehle vom Handy sind an Stefans Connect-Login gebunden und HMAC-signiert; der PC prüft Signatur,
  Besitzer und Alter (< 2 min).
- Screenshots nur nach ausdrücklicher Freigabe im Popup (optionale Berechtigung).

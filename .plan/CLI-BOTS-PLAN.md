# Connect: Bots über Anbieter-CLIs, unsichtbar, nur mit deinem Login

Stand: 06.10.2026, 01:45. Gilt für OpenBot-v2-Helium und die Connect App (`localhost:3101`).

## 1. Ziel

Im Agenten auf **+** klicken, einen Anbieter wählen (Codex/ChatGPT, Claude, Manus, Grok Bot, Pi, Lovable …), einmal mit deinem eigenen Konto anmelden, fertig. Ein Terminal siehst du nie. Der Agent antwortet im normalen Connect-Chat und nutzt dafür dein Abo bei diesem Anbieter, ohne API-Key. Wer lieber einen API-Key nimmt, stellt das in den Einstellungen pro Anbieter um.

## 2. Wie es die anderen machen

| Wer | Trick |
|---|---|
| **Obsidian Copilot V4** | Holt sich Claude Code, Codex und opencode in Obsidian. Claude Code wird per „Auto-detect“ gefunden und läuft mit *deinem* Claude-Login. Codex hängt über den Adapter `@agentclientprotocol/codex-acp` dran (ACP = Agent Client Protocol, ein JSON-RPC-Protokoll zwischen App und CLI-Agent). Die CLI läuft als unsichtbarer Hintergrundprozess, die App zeigt nur Chat, Tool-Schritte und Rückfragen. Das geht nur am Desktop, nicht mobil. |
| **Cursor / Grok Bot** | Gleiches Prinzip. Die CLI bzw. der Agent läuft headless im Hintergrund, der Login bleibt bei der CLI, und die Oberfläche liest nur den Ereignis-Stream (JSON-Lines). |
| **grok-bot-cli (`gbot`)** | Nutzt die verschlüsselte Sitzung der Grok-Bot-Desktop-App, die auf deinem PC installiert ist. Damit lassen sich Bots auflisten, anlegen und anschreiben und Threads lesen. |

**Fazit:** Wir bauen nichts Eigenes für den Login. Die CLI meldet sich selbst an (Browser-OAuth), und Connect startet sie unsichtbar und liest ihre JSON-Ausgabe.

## 3. Architektur

```
Connect-Chat (Web-UI, unverändert)
   │  CopilotKit-Run wie bisher
   ▼
copilot.ts ──► Agent-Hub resolveModel(agentId)
                 │ Anbieter = "codex-cli" | "claude-cli" | "manus" | "pi-cli" | …
                 ▼
          CLI-Modell-Adapter  (AI-SDK-LanguageModel, im Server)
                 │ startet versteckt (windowsHide, kein Fenster, keine Shell)
                 ▼
     node codex.js exec --json …   /   node claude cli.js -p --output-format stream-json …
                 │ Prompt über stdin, Antwort als JSON-Lines
                 ▼
          Text-Stream zurück in den Chat (+ Abbrechen = Prozessbaum beenden)
```

Die Bausteine:
1. **CLI-Runner:** Findet die installierte CLI (`%APPDATA%\npm\node_modules\…`) und startet sie ohne Fenster. Der Prompt geht über stdin, damit es keine Probleme mit Zeichen oder Länge gibt. Dazu kommen ein Timeout, Abbrechen per Prozessbaum-Kill und ein eigener Arbeitsordner pro Agent unter `%LOCALAPPDATA%\ConnectApp\cli-agents\<agentId>`.
2. **Auth-Bridge:** Der Knopf „Anmelden“ startet versteckt `codex login` bzw. `claude auth login`. Der Browser öffnet sich mit der normalen Anbieter-Anmeldung, und Connect fragt im Hintergrund `codex login status` bzw. `claude auth status` ab, bis der Status grün ist. **Connect liest nie selbst Token-Dateien.** Der Login bleibt komplett bei der CLI.
3. **Stream in den Chat:** Der Adapter erscheint dem Chat wie ein normales Modell. Dadurch bleiben Chat-UI, Chat-Speicher, Abgleich und Premium-Design unverändert.
4. **Anbieter pro Agent:** Unter Agent › Einstellungen › Modell gibt es neue Anbieter („Codex (ChatGPT-Login)“, „Claude (Claude-Login)“ …) mit Modellwahl. Die Rechte stehen standardmäßig auf **nur lesen** (Sandbox read-only). „Darf Dateien ändern“ wird ein eigener Schalter.
5. **Sitzungen (Phase 2):** Pro Chat merken wir uns die `thread_id` bzw. `session_id` und setzen mit `codex exec resume` / `claude --resume` fort, statt den Verlauf jedes Mal neu zu schicken. Das spart viele Tokens.
6. **ACP (Phase 3):** Der gleiche Weg wie bei Obsidian Copilot, mit `codex-acp` und dem Claude-ACP-Adapter. Damit kommen live sichtbare Tool-Schritte und Rückfragen („Darf ich diese Datei ändern?“) in den Chat.

## 4. Machbarkeit pro CLI (auf deinem PC geprüft)

| CLI | Stand auf deinem PC | Login | Machbarkeit | Bemerkung |
|---|---|---|---|---|
| **Codex** (`@openai/codex` 0.160.1) | installiert, **mit ChatGPT angemeldet** | ChatGPT-Konto | ✅ **getestet: Antwort in ca. 10 s** | Dein `config.toml` stellt `gpt-5.2` ein, das mit ChatGPT-Login abgelehnt wird. Connect nutzt deshalb eigene Einstellungen (`--ignore-user-config`) und `gpt-5.5`. Verfügbar: gpt-5.5, gpt-5.6-terra, gpt-5.6-luna, gpt-6-luna. |
| **Claude Code** (2.1.87) | installiert, aber per Umgebungsvariable auf einen **lokalen Modellserver** umgeleitet (`ANTHROPIC_BASE_URL=http://127.0.0.1:1337`, Modell GLM-4.7-Flash). Der Server läuft gerade nicht, deshalb laufen die 10 Fehlversuche ins Leere. | Claude-Abo (OAuth) | ⚠️ fertig gebaut, braucht noch deinen Login | Connect entfernt diese Umleitung für seine Agenten, damit dein echtes Claude-Konto genutzt wird. Deine Umleitung für das normale Terminal bleibt unverändert. Dafür einmal „Mit Konto anmelden“ klicken (startet `claude auth login`), dazu wird ein Claude-Pro/Max-Abo gebraucht. Empfohlen ist außerdem das Update auf 2.1.289. |
| **Manus** (`manus-cli`, Python ≥ 3.11) | nicht installiert, Python 3.11 und 3.13 sind da | **nur API-Key**, kein Konto-Login | ✅ mittel | Die CLI ist nur eine Hülle um die Manus-API. Besser rufen wir die **Manus-API direkt vom Server** auf (Task anlegen, abfragen, Ergebnis in den Chat). Der Key liegt dann verschlüsselt in Einstellungen › API-Keys. Eine Python-Abhängigkeit braucht es nicht. |
| **Grok Bot** (`grok-bot-cli`/`gbot` 0.12.3, Node ≥ 22.19) | **gbot installiert + getestet** (`gbot bots list --json` → ~50 Bots) | Desktop-App-Sitzung (DPAPI) | ✅ **Sync MVP live** | Freigabe 06.10. API `GET/POST /api/agent-hub/grok-bots`, UI Einstellungen › Anbieter-CLIs › „Grok Bots holen“. Import → Connect-Agenten (Quelle `grok-bot`), Map unter `%LOCALAPPDATA%\ConnectApp\cli-agents\grok-import-map.json`. Später: spiegeln per `gbot send`. |
| **Pi** (`@earendil-works/pi-coding-agent`) | nicht installiert | laut Doku viele Modelle, auch per Abo-Login | ✅ gut, später | Hat Print/JSON-, RPC- und SDK-Modus. Pi eignet sich gut als universelles Backend für Anbieter, die keine eigene CLI haben. |
| **Lovable** (`lovagentic`) | nicht installiert | Browser-Login (Playwright) oder Lovable-API-Key (Vorschau) | 🟡 als **Werkzeug**, nicht als Chat-Gehirn | Lovable ist kein Chat-Agent, sondern baut Lovable-Projekte (prompt, verify, publish). Das passt zu Flux Code als Tool. Den Weg „Firebase-Bearer-Token aus der Desktop-App abgreifen“ nutzen wir **nicht**, sondern nur Browser-Login oder einen offiziellen Key. |
| **Hermes Agent** | nicht installiert | eigener Key (OpenRouter/Codex/…) | 🟡 Phase 3 | Achtung, Namensgleichheit: Die eingebauten Connect-Agenten heißen im Code auch „Hermes“. Gemeint ist hier der externe Hermes Agent mit eigenem Key. |
| **Google / Gemini CLI** (`@google/gemini-cli` 0.28.2 / 0.62) | **installiert**; OAuth braucht interaktives Terminal (`gemini`) | Google-Konto oder `GEMINI_API_KEY` / `GOOGLE_GENAI_API_KEY` | ✅ Status-Stub live | Chat/Tools: `gemini -p …`. **Video:** zusätzlich `npm i -g google-genai-api`, dann `google-genai --veo --prompt "…" --veo-duration 8`. Stefans Login fehlt noch (OAuth oder API-Key). |
| **freebuff** (`npm i -g freebuff` 0.0.186) | **installiert** | Freebuff-Konto (`freebuff login`) / BYOK | ✅ Status-Stub live | Coding + **Browser-Use**. Einstellungen › Anbieter-CLIs zeigt Status. Adapter/Chat-Verdrahtung folgt. Hinweis früher SEO: ToS prüfen — Stefan will es explizit für Browser. |
| **GlobalBots** | unklar | ? | ❓ | Bitte kurz sagen, welcher Dienst damit gemeint ist (Link). |

## 5. Bots synchronisieren, exportieren, importieren
- **Export:** pro Agent oder alle als `connect-bots.json` im Format `connect-bot.v1`. Drin sind Name, Avatar, Anweisungen, Anbieter, Modell, Skills, MCP-Verweise und Browser-Profil-Name. **Keine Schlüssel**, die bleiben im Tresor.
- **Import:** Datei auswählen, Vorschau, Duplikate werden erkannt (gleicher Name plus Quelle), es wird nur ergänzt.
- **Grok-Bot-Sync:** „Grok Bots holen“ führt `gbot bots list --json` aus, du hakst an, welche du willst, und sie werden als Connect-Agenten angelegt (Quelle `grok-bot`). Später gibt es optional den Modus „spiegeln“: Ein Connect-Chat mit dem Agenten geht dann per `gbot send` an den echten Grok Bot.

## 6. Einstellungen › Anbieter (neue Seite, im Premium-Look)
Pro Anbieter eine Karte mit:
- Status: installiert / angemeldet / Version
- Knopf **Anmelden** (Konto) oder **API-Key nutzen** (umschaltbar)
- Standard-Modell und Sandbox-Stufe
- „Installieren“-Knopf, wenn die CLI fehlt (npm/pip im Hintergrund, mit Rückfrage)

## 7. MVP-Reihenfolge
1. **Codex über ChatGPT-Login als Agent-Anbieter** *(gestartet)*: Adapter, Anbieter `codex-cli`, Modellwahl, read-only, eigener Ordner pro Agent.
2. **Claude über Claude-Login** *(Adapter mitgebaut)*: läuft, sobald Claude Code aktualisiert ist.
3. Anbieter-Status-API und Einstellungsseite „Anbieter“ mit „Anmelden“-Knopf (Auth-Bridge).
4. Manus per API-Key (direkter API-Aufruf, Task-Status im Chat).
5. Grok-Bot-Sync/Import über `gbot` *(MVP list+import live)*, dazu Export/Import im Format `connect-bot.v1` (Export folgt).
6. Sitzungen fortsetzen (resume) und Live-Tool-Schritte (ACP).
7. Pi als universelles Backend, Lovable als Werkzeug für Flux Code, Hermes Agent.
8. **Google CLI / Veo** als Tool für Video-Generierung aus Code (nach Grok-Sync).
9. **freebuff** als Coding- + Browser-Steuerungs-CLI (nach Google oder parallel zu Manus).

## 8. Was du dafür tun musst
- **Claude:** einmal mit deinem Claude-Konto anmelden (Knopf im Agenten oder `claude auth login`). Optional `npm i -g @anthropic-ai/claude-code@latest`.
- **Manus:** deinen Manus-API-Key unter Einstellungen › API-Keys eintragen.
- **Grok-Bot-Sync:** ✅ freigegeben. Optional: in Einstellungen › Anbieter-CLIs Bots holen/importieren.
- **Google/Veo:** einmal `gemini` OAuth **oder** `GOOGLE_GENAI_API_KEY` setzen; optional `npm i -g google-genai-api`.
- **freebuff:** einmal `freebuff login`.
- **GlobalBots:** Link oder Name des Dienstes.

## 9. Stand MVP (06.10.2026, ca. 01:45)
- `apps/server/src/agent-hub/cli-model.ts`: CLI-Runner (Codex/Claude), AI-SDK-Modell, Status, Login-Start.
- `agent-hub/gbot-sync.ts` + `cli-extras.ts` **neu**: Grok list/import (windowsHide), Status-Stubs Google Gemini / Veo (`google-genai-api`) / freebuff.
- `routes.ts` + `app.ts`: `GET /api/agent-hub/grok-bots`, `POST /api/agent-hub/grok-bots/import` (legt Agenten über Profile-Store an). `GET /cli-providers` liefert jetzt auch gbot/Google/freebuff.
- UI: Einstellungen › **Anbieter-CLIs** (`cli-providers`) — Status-Karten + „Grok Bots holen“ / Import-Checkboxen. Agent-Modell-Panel: `codex-cli` / `claude-cli` weiter wählbar.
- Getestet: `gbot bots list --json` (Desktop-Sitzung OK). Codex-Adapter zuvor OK. Google OAuth/Veo-Key und freebuff-login: Stefan.
- Sicherungen: `*.bak-helium-clibots`, `*.bak-helium-groksync-*`.
- Live: Server-Dateien in `connect-app/runtime` gespiegelt; Bun-Neustart ohne `Connect.exe --stop`. UI-Build ggf. nötig für den neuen Einstellungs-Tab.

## Freigaben (Stefan)
- **06.10. ~01:21:** Grok-Bot-Sync erlaubt — `gbot` darf die Desktop-Sitzung nutzen.
- **06.10. ~01:32:** Google CLI (Video aus Code) + freebuff (Browser-Steuerung) als weitere unsichtbare Provider-CLIs gewünscht.

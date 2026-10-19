# Copy-Paste Prompt für neuen Chat (Model One Implementierung)

---

```
Du bist ein Senior Systems Architect. Implementiere "Model One" - ein zentrales KI-Orchestrierungs-System. Lies zuerst diese kompletten Anforderungen, dann beginne mit Recherche und Implementierung.

## KONTEXT
Das System läuft in "Connect" (siehe https://github.com/Kunc-GmbH/Connect). Es ist bereits eine vollständige Multi-Tenant Webapp mit Auth, Agents, Browser-Engine, Brain (Markdown-Speicher), MCP, Mobile-Tabs, Voice, Market, Knowledge vorhanden. Codebase: C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium (lokale Windows-Dev-Maschine).

Vor dem Coden:
1. Repo-Struktur erkunden (apps/app, apps/connect-notch, apps/connect-app, apps/server, apps/voice, apps/connect, packages/...)
2. Existierende Agent-Mechanik, Auth, Routes, Settings, Sidebar lesen
3. Verstehen wie Grok Bot funktioniert (Code-Ref + Tool-Calls) und wie du ihn so umbauen kannst, dass er Model One = "General AI mit PC-Zugriff" wird

## ZIEL (das Endprodukt muss exakt das leisten)
3 Grok-Bots (User-Konten) je 20 Model-One Agents (60 total) zu 100-Swarm-Clustern zusammenfassbar. Jeder Model One hat:
- Volle PC-Steuerung (Tastatur, Maus, Apps öffnen, Browser bedienen)
- Zugriff auf JEDES Tool auf dem PC, JEDEN Browser, JEDE App, JEDE MD-Datei im Spark Brain
- Zugriff auf JEDE API die User einrichtet (beliebig viele Keys pro Anbieter)
- Zugriff auf JEDE CLI die installiert ist (Gemini CLI, Claude Code, Codex CLI, ChatGPT CLI, Freebuf CLI, ...)
- Fähigkeit Browser-Agenten (Manus via https://manus.im/app + Chrome Extension, Perplexity Computer Use, ...) zu steuern
- Shared Brain via Markdown (kein Kontextverlust, Agenten lesen/schreiben sich gegenseitig)
- MCP-Server durch den man alle 60 Agents erreicht/wartet
- Auto-Token-Sparmodus: vor jeder Antwort wird im Hintergrund geprüft:
  * Welche lokalen Token-Spar-Repositorys auf Github existieren (LiteLLM, OpenRouter, Helicone, LangChain Cache, Semantic Cache, ...) und ob sie einsetzbar sind
  * Welche API-Keys/CLIs gerade leer sind
  * Welche Resourcen am günstigsten sind
  * Welche Browser-AIs (Perplexity, You.com, Phind, ...) für die Antwort reichen würden
  * Welche Resourcen nachgefüllt werden müssen → wird extern Grok-Bot gemeldet
- Sofort einsatzbereit, nicht "irgendwann fertig"

## ARCHITEKTUR-VORGABEN
1. SINGLE ORCHESTRATOR ENGINE - nicht 3 verschiedene. Ein `model-one` Package das konfigurierbar ist
2. Multi-Key pro Provider (Round-Robin + Least-Used + Failure-Failover)
3. Multi-CLI pro Provider (mehrere Gemini CLIs, mehrere Claude Code Instanzen, ...)
4. Brain als gemeinsamer Speicher (Markdown + Vektor optional) - alle 60 Agents lesen/schreiben dort
5. Task-Routing mit Reasoning: erst planen (welche Resource), dann ausführen, dann Ergebnis zurück
6. Self-Research: Model One kann im laufenden Betrieb neue Resourcen recherchieren (z.B. "gibt es noch einen besseren Token-Sparer?")
7. MCP-Server der alle 60 Agents exposed und Monitoring/Refill-Warnungen liefert
8. UI: rechts ausklappbare Sidebar mit Live-Token-Stats, Key-Health, CLI-Status, Subagent-Queue

## DESIGN-REGELN (bei jeder Implementierung prüfen)
- LOGIK: macht der Codeflow das was er soll? Kein "ich glaube es geht" - du MUSST es mit Tests/Manuell-Check verifizieren
- ÜBERSICHT: maximal 1 Verantwortung pro Datei, klare Exports, kein Spaghetti
- FUNKTION: läuft es auch? Nicht nur compilen, sondern echt testen (Browser, curl, log)
- API-KEYS: alle externen Calls brauchen Keys - immer Config laden, nicht hardcoded
- AGENT.MD: jeder Agent hat eine agent.md mit:
  * System-Prompt
  * Resource-Liste (welche APIs/CLIs er nutzen darf)
  * Routing-Regeln (welche Aufgabe → welche Resource)
  * Memory-Zugriff (welche Brain-Pfade er lesen/schreiben darf)
  * Subagent-Routing (an wen er weitergeben kann)
- SPRACHE/GEHIRN: Shared Brain über Markdown-Dateien mit Frontmatter-Indizes, kein Kontext geht verloren
- EINSATZBEREIT: am Ende muss ich im Browser auf http://localhost:3101/agent/<uuid> öffnen können und ALLES geht (Settings, Resourcen, Chat, Sidebar, MCP)

## FORSCHUNGSPFLICHT (vor Code)
Du MUSST selbst recherchieren, nicht raten. Mindestens:
- Wie funktioniert Grok Bots offiziell (xAI API) - Doku lesen
- Wie funktioniert Manus im Browser (https://manus.im/app) - Doku lesen  
- Wie funktioniert Perplexity Computer Use (https://www.perplexity.ai/computer) - Doku lesen
- Welche Token-Spar-Repositorys auf Github existieren (LiteLLM, OpenRouter, Helicone, Portkey, Bifrost, LangChain Semantic Cache, GPTCache, ...) - mind. 5 vergleichen
- Welche Browser-AI-Tools gibt es (Phind, You.com, Komo, Andi, ...) - mind. 5 listen
- Welche MCP-Server-Patterns für Multi-Agent gibt es - Doku lesen
- Welche bestehenden Libraries für Multi-Key-Management gibt es

Recherche-Ergebnisse als MD unter .plan/model-one-research/ ablegen, dann erst implementieren.

## PHASEN (in dieser Reihenfolge, jede Phase vollständig testen bevor du weitergehst)
PHASE 1: Zentraler Orchestrator `model-one/engine/` (TypeScript, läuft in apps/server)
  - TaskRouter mit Reasoning
  - ResourceRegistry (API-Keys + CLIs + Browser-Agents)
  - MultiKeyManager (Round-Robin + Failover)
  - BrainInterface (lesen/schreiben von Markdown mit Frontmatter-Index)
  - SubagentDispatcher (HTTP-Calls zu anderen Model One Instanzen)
  - Token-Spar-Layer (Semantic Cache + LiteLLM-Routing)
  - Unit-Tests + Integration-Test (echter End-to-End Lauf)

PHASE 2: CLI-Spawning 
  - Gemini CLI (multi-instanz, parallel)
  - Claude Code CLI
  - Codex CLI  
  - ChatGPT CLI
  - Freebuf CLI
  - Process-Pool mit Restart-on-Fail
  - Output-Parser pro CLI

PHASE 3: Browser-Agenten
  - Manus: Web-Interface (https://manus.im/app) + Chrome Extension Bridge
  - Perplexity Computer Use (https://www.perplexity.ai/computer)
  - Generischer BrowserAgent-Adapter

PHASE 4: MCP-Server
  - 60 Agents als MCP-Tools exposed
  - Monitoring: Token-Verbrauch, Key-Health, CLI-Status
  - Auto-Warning wenn Resource <20% voll
  - Health-Endpoint

PHASE 5: UI
  - Sidebar rechts: Live-Stats (Token-Counter, Key-Bars, CLI-Status, Subagent-Queue, Kosten)
  - Settings: alle Resourcen verwaltbar (Keys hinzufügen, CLIs konfigurieren, Browser-Agents aktivieren)
  - Swarm-View: 100-Agent-Cluster-Ansicht mit Drag-and-Drop-Routing
  - Agent.md Editor inline
  - Brain-Browser (Markdown-Viewer mit Agent-Ownership)

PHASE 6: Swarm-Logic
  - 3 Grok-Bots × 20 Agents = 60
  - Cluster zu 100-Swarm (Agents leihen sich gegenseitig aus)
  - Load-Balancing zwischen Clustern
  - Cross-Cluster-Brain-Sync (Konfliktauflösung über Timestamp + Priority)

PHASE 7: Selbstrecherche-Loop
  - Bei jeder User-Frage Hintergrund-Check:
    * Bessere Token-Sparer verfügbar? (Github API Search)
    * Bessere Browser-AIs? (RSS/Web-Search)
    * Bessere CLIs? (npm/pip check)
  - Vorschlag an User: "Neue Resource gefunden, einrichten?"

PHASE 8: Polish + Deploy
  - Production-Build sauber
  - Mirror zu apps/connect-app/runtime/connect/ syncen
  - Restart-Connect.exe
  - Browser-Test auf 3101: kompletter Flow
  - Doku: README + .plan/MODEL-ONE-DEPLOYMENT.md

## WICHTIGE REGELN
- NIEMALS nur "es sollte gehen" - du musst es echt testen (Browser öffnen, curl, logs lesen)
- NIEMALS API-Keys hardcoden
- NIEMALS Spaghetti-Code - jede Datei hat eine Verantwortung
- NIEMALS Phase überspringen - jede Phase hat Acceptance-Kriterien die du explizit abhakst
- IMMER nach jeder Phase: Status-Update in .plan/MODEL-ONE-STATUS.md
- IMMER mit dem User abstimmen bevor du anfaengst - zeig erst deinen Plan
- IMMER Token-Sparen: nutze wo moeglich Browser-AIs statt eigener API-Calls

## LIEFER-ARTEFAKTE
1. .plan/MODEL-ONE-STATUS.md - Live-Status aller Phasen
2. .plan/model-one-research/*.md - Recherche-Ergebnisse
3. apps/server/src/model-one/ - Engine Source
4. apps/app/src/routes/model-one.* - Frontend Routes
5. apps/connect-app/runtime/connect/... - gesyncter Production-Build
6. Funktionsfaehige Demo auf http://localhost:3101

Starte mit: REPOSITORY-ERKUNDUNG (was gibt es schon an Agent-Mechanik, Settings, Sidebar) + FORSCHUNG (Grok/Manus/Perplexity + Token-Sparer). Danach zeigst du dem User deinen Plan und fragst ob du loslegen sollst.
```

---

# HINWEISE FÜR DICH

Diesen Prompt komplett in einen **neuen Chat** einfügen. Dort dann:
- **Cursor** als IDE benutzen (öffnet die Codebase automatisch)
- Der neue Agent macht erst Recherche, zeigt Plan, fragt, dann implementiert
- **3 Grok-Bots × 20 Model One = 60 Agents → 100-Swarm-Cluster** = dein Endgame

Speicherort: `.plan/MODEL-ONE-NEW-CHAT-PROMPT.md`

# Connect — Wave, Rakazo, Hermes, Augen, VM-Tiers

Fortsetzung von [035](./035-research-codex-hermes-sandbox.md). Fokus: **ein Harness wie Claude Code / Hermes**, nicht zehn neue Produkte.

## Oracle / VM-Tiers — ist „groß / klein / lokal“ gut?

**Ja als Modell, nein als drei Plattformen sofort.**

| Auftrag | Wo | Connect heute |
|---|---|---|
| Normal | selbst gehostet (Docker Mini-Ubuntu / `agent-computer`) | ✅ schon da |
| Klein / idle | warmes lokales Sandbox / später Modal-ähnlich | teilweise |
| Groß / heavy | Cloud-VM (Oracle Free, Daytona, E2B …) on demand | Cloud-Computer-Ansätze vorhanden |

**Regel:** Ein Agent-API mit `runtime: local | cloud`. UI zeigt nur „Computer: Lokal / Cloud“. Nicht drei parallele Stacks.

Oracle Always Free ist ok für Experimente (Quota/Region beachten) — erst sinnvoll, wenn lokale Jobs an CPU/RAM stoßen.

## Was wir von wem abschnappen

### [Wave Terminal](https://github.com/wavetermdev/waveterm)
- Command-Blocks (ein Befehl = eine Karte, isoliert)
- Terminal liest eigenen Scrollback als AI-Kontext
- Durable Sessions (Reconnect)
**→ Connect:** Bot-CLI von „dummer Queue“ zu **Block-Terminal** (Output streamen, Interrupt, Context an Agent).

### [Agent Reach](https://github.com/Panniantong/Agent-Reach) — Augen
- Capability-Layer: Web, YT, X, GitHub, RSS, Suche — `doctor` + Fallback-Routen
- Agent braucht keine eigenen Scraper
**→ Connect:** Skill/MCP-Pack „Reach“ für Karriere-Agents; nicht jedes Tool selbst bauen.

### [Rakazo](https://github.com/elie222/rakazo) — Schwesterprodukt
- Web + Electron + **Expo Mobile** gegen dieselbe API
- MCP / OpenAPI / Composio als Integrations-Schicht
- Team- vs Private-Computer, Subagents
**→ Connect:** (1) Mobile = Client derselben API (PWA zuerst, Expo später). (2) MCP-Builder-UX wie bei ihnen (URL → Tools). Wir haben schon MCP-Katalog — fehlen UX + Mobile-Client.

### [browser-use](https://github.com/browser-use/browser-use)
- Reifer Browser-Agent (Python/TS) + optional Cloud
**→ Connect:** als Tool hinter Watch/Ubuntu-Browser, nicht als Ersatz der Isolation. Alternativ CLI/Harness-Skill installieren.

### [Hermes Agent](https://github.com/nousresearch/hermes-agent) — der Harness
Das Zielbild (Claude-Code-ähnliche Präzision):

1. **Ein Agent-Loop** — Tools → Ergebnis → weiter (kein Durcheinander)
2. **Permissions** — Ask / Allow / Deny (haben wir für MCP; auf Shell/Browser ausweiten)
3. **Compress / Usage** — Context bewusst kürzen
4. **Skills + Memory** — lernen zwischen Sessions
5. **Interrupt** — neue Nachricht stoppt laufenden Turn
6. **Subagents** — parallele kurze Jobs, Ergebnis zurück
7. **Backends** — local | docker | ssh | cloud (wie Hermes’ sieben Backends, bei uns erst 2–3)

**→ Connect „Hermes-Profil“:** Konvention + Loop-Guards in LangGraph/CopilotKit, nicht Hermes als Dependency forken.

### Paperclip / Freeflow / Aiden / Qwen-Agent
- Paperclip: Agent-Ops-UI (Tasks, Status) — Ideen für L2/L3 Statusleisten  
- Freeflow: Motion/Speed — UI-Polish, nicht Runtime  
- Aiden: Desktop-Control — gleiches Muster wie Computer-Tools, Permissions streng  
- Qwen-Agent: weiteres Framework — **nicht** parallel zu Hermes-Profil einführen  

### Claude Code Orchestration ([codeaashu/claude-code](https://github.com/codeaashu/claude-code) u. ä.)
Unoffizielle/Clone-Repos: **Muster lernen, keinen proprietären Anthropic-Code kopieren.**  
Übernehmen: Tool-Schema-Klarheit, Permission-Modes, Compaction, sichtbarer Plan/Todo, saubere Transcript-Struktur.

## Hermes-Harness für Connect (Zielarchitektur)

```
User message
  → Planner (kurz, optional sichtbar)
  → Tool router (nur freigegebene Tools)
  → Execute (Computer / Browser / CLI / Reach / MCP)
  → Observe (stdout, a11y-snapshot, screenshot)
  → Reflect / compact if needed
  → Reply or next tool
Interrupt anytime · Permission gate · Memory write nudges
```

Jeder Connect-Agent = dieses Profil + Company-Rollen-Prompt.  
Augen = Agent Reach Pack.  
Hände = Computer + browser-use.  
Stimme/Terminal = Wave-artige Blocks.

## Reihenfolge (minimal, persönliches Experiment)

1. **Hermes-Loop-Guards** im bestehenden Bot (Interrupt, tool allowlist, compact)  
2. **Bot-CLI → Block-Terminal** (Wave-Ideen)  
3. **Agent Reach** als Skill für Karriere-Agents  
4. **browser-use** hinter Ubuntu-Browser  
5. **Mobile:** PWA gegen laufende API (Rakazo-Muster)  
6. **VM-Tier cloud** nur wenn lokale Jobs knacken  
7. Paperclip-Status / Freeflow-Motion als Polish  

Nicht alles gleichzeitig. Der „coole Harness“ ist Schritt 1–2.

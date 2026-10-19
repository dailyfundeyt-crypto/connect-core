# MODEL ONE - Zentraler Orchestrator-Agent

## Konzept

```
USER ──────► MODEL ONE (zentraler Agent)
                  │
                  ├─ spricht mit: Grok Bot
                  │
                  ├─ steuert Subagenten (per API)
                  │     ├─ leichte Aufgaben
                  │     ├─ Datenanalyse
                  │     ├─ Erinnerungen
                  │     └─ Code/Scraping
                  │
                  ├─ nutzt Resourcen:
                  │     ├─ Perplexity Computer Use (Browser)
                  │     ├─ Manus (Chrome Extension + Web)
                  │     ├─ Gemini CLI (Multi-Key)
                  │     ├─ ChatGPT CLI (Multi-Key)
                  │     ├─ Claude Code CLI
                  │     ├─ Codex CLI
                  │     └─ Freebuf CLI
                  │
                  └─ Sidebar: Alle Nutzungsdaten rechts
```

## MODEL ONE - Was er kann

### 1. Zentrale Intelligenz
- **Eingabe**: Natürliche Sprache vom User
- **Denkprozess**: Entscheided welche Resource für welche Aufgabe
- **Output**: Fertige Ergebnisse + Updates in Sidebar

### 2. Resourcen-Verwaltung (Settings)
```
MODEL ONE SETTINGS
├── API Keys (pro Anbieter mehre Keys)
│     ├── Google/Gemini:  Key1, Key2, ... KeyN
│     ├── OpenAI/GPT:     Key1, Key2, ... KeyN
│     ├── Anthropic/Claude: Key1, Key2, ...
│     └── Andere:         ...
│
├── CLIs (pro Anbieter mehre)
│     ├── Gemini CLI
│     ├── ChatGPT CLI (o1-preview, o1-mini, etc)
│     ├── Claude Code CLI
│     ├── Codex CLI
│     └── Freebuf CLI
│
└── Browser Agenten
      ├── Perplexity Computer Use
      ├── Manus (Extension + Web: https://manus.im/app)
      └── Andere
```

### 3. Aufgaben-Routing
```
AUFGABE REIN
     │
     ▼
┌─────────────────────────────────────────┐
│  MODEL ONE entscheidet:                  │
├─────────────────────────────────────────┤
│  leicht + schnell     → Subagent API     │
│  Browser nötig        → Manus / Perplexity│
│  Code schreiben       → Claude Code CLI  │
│  Schwere Analyse      → Codex CLI        │
│  Web Recherche        → Perplexity       │
│  Billing/Token-Sparen → Multi-Key Round │
└─────────────────────────────────────────┘
```

## STACK

### API Keys (10 Keys, 10M Tokens)
- Gemini API Keys (x3)
- OpenAI API Keys (x3)
- Anthropic API Keys (x2)
- Andere (x2)

### CLIs
| CLI | Nutzung | Provider |
|-----|---------|----------|
| `gemini` | Hauptgespräch, Aufgaben | Google |
| `chatgpt` | Alternativ, o1 Tasks | OpenAI |
| `claude-code` | Code schreiben, Debug | Anthropic |
| `codex` | Schwere Aufgaben, Agents | OpenAI |
| `freebuf` | Security, Scraping | Custom |
| `perplexity` | Web Recherche | Perplexity |

### Browser Agenten
| Agent | Interface | Nutzung |
|-------|-----------|---------|
| **Manus** | Web + Chrome Extension | Browser Control |
| **Perplexity Computer Use** | https://www.perplexity.ai/computer | Web Navigation |
| **Grok Bot** | In-App | Alternative UI |

## SIDEBAR (rechte Seite)

```
┌─────────────────────────────┐
│ 📊 NUTZUNGSDATEN            │
├─────────────────────────────┤
│ 🔑 API Keys                 │
│   Gemini-Key-1: 1.2M tokens│
│   Gemini-Key-2: 890K       │
│   GPT-Key-1:   500K        │
│   ...                       │
├─────────────────────────────┤
│ 🖥️ CLIs                     │
│   Gemini CLI: 45 Requests   │
│   Claude Code: 12 Requests  │
│   Codex: 3 Requests         │
├─────────────────────────────┤
│ 🌐 Browser Agenten          │
│   Manus: aktiv, 8 Tabs     │
│   Perplexity: idle          │
├─────────────────────────────┤
│ 👥 Subagenten               │
│   Aktive: 3                 │
│   Wartend: 1                │
└─────────────────────────────┘
```

## IMPLEMENTIERUNG

### Phase 1: Model One Agent
- [ ] Zentraler Agent mit System-Prompt
- [ ] Resourcen-Config (API Keys, CLIs)
- [ ] Routing-Logik

### Phase 2: CLI Integration
- [ ] Gemini CLI anbinden
- [ ] ChatGPT CLI anbinden
- [ ] Claude Code CLI anbinden
- [ ] Codex CLI anbinden
- [ ] Freebuf CLI anbinden

### Phase 3: Browser Agenten
- [ ] Manus Web Interface (https://manus.im/app)
- [ ] Manus Chrome Extension
- [ ] Perplexity Computer Use

### Phase 4: Sidebar + Monitoring
- [ ] Nutzungsdaten pro Resource
- [ ] Token-Zähler
- [ ] Request-Logs
- [ ] Kosten-Anzeige

## TECHNISCH

### Model One Backend
- Node.js/Bun Service
- SQLite für Config + Logs
- CLI Spawning via child_process
- API Calls via fetch

### Kommunikation
```
Model One <───► Grok Bot (UI)
     │
     ├─► Gemini CLI (child_process)
     ├─► Claude Code (child_process)
     ├─► Manus API
     ├─► Perplexity API
     └─► Subagents (HTTP)
```

## BEISPIEL KONVERSATION

```
USER: Schreibe ein Python Script das meine CSV Dateien analysiert

MODEL ONE:
├─ erkennt: Code-Aufgabe, mittel-schwer
├─ nutzt: Claude Code CLI
├─ gibt fertigen Code zurück
└─ logged: Claude Code: 1 Request, 45K tokens

---

USER: Finde alle Artikel über AI Agents von heute

MODEL ONE:
├─ erkennt: Recherche, Browser nötig
├─ nutzt: Perplexity Computer Use
├─ navigiert perplexity.ai
├─ sucht "AI Agents news today"
└─ gibt Links + Zusammenfassung zurück

---

USER: Überprüfe meine Chrome Tabs und schließe duplikate

MODEL ONE:
├─ erkennt: Browser-Control Aufgabe
├─ nutzt: Manus Chrome Extension
├─ listet Tabs auf
├─ findet Duplikate
└─ schließt sie via Extension API
```

---

## WICHTIG

- **Einfachheit**: Ein Model One, alle anderen sind nur Werkzeuge
- **Verdeckt**: User sieht nur Model One + Sidebar
- **Multi-Key**: Automatic Round-Robin bei Keys
- **Fallback**: Wenn eine Resource failt, try next

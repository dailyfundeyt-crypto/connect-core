# Connect — Lernnotiz aus Fremdprojekten (Codex, Sandbox, Browser, Hermes)

Persönliches Experiment, nicht Production-SaaS. Ziel: **deinen Codex-/ChatGPT-Plan in Connect nutzen**, minimalistisch, ohne alles umzubauen.

## Brauchen wir microsandbox?

**Nein, nicht als Ersatz für die Mini-Ubuntus.**

| | Connect heute (`agent-computer`) | [microsandbox](https://github.com/superradcompany/microsandbox) |
|---|---|---|
| Isolation | Docker-Container + Chromium pro Bot | echte Micro-VMs (KVM/WHP), &lt;100 ms Boot |
| Stärken | Browser-Watch, Screenshots, schon verdrahtet | Code-Sandbox, Branch/Snapshot, Secrets-Isolation |
| Aufwand | läuft | neues Runtime, Beta, Host-Voraussetzungen |

**Empfehlung:** Mini-Ubuntus behalten für Browser. microsandbox nur später optional für *untrusted code exec* — nicht jetzt.

## Codex-Plan in Connect (dein Kernziel)

Projekte wie [claudecodex](https://github.com/karem505/claudecodex) und [openclaw-tune-codex-plus](https://github.com/MOZARTINOS/openclaw-tune-codex-plus) zeigen das Muster:

1. **Subscription-Auth** (ChatGPT/Codex Login), nicht `OPENAI_API_KEY`
2. **Lokaler Proxy** (Anthropic- oder OpenAI-kompatibel) → Codex-Backend
3. Agent-UI spricht mit dem Proxy wie mit einer normalen API
4. Heartbeat/Bootstrap klein halten (sonst ist die Wochenquote weg)

Connect hat schon CLI-Targets (`chatgpt`, `cursor`, …) und Bot-CLI-Panel — die **Desktop-Bridge fehlt noch** (Queue bleibt lokal).

**Minimaler Experiment-Pfad:**

1. Codex CLI / `claude-code-proxy` einmal auf der Maschine einloggen  
2. Connect-Agent `chatgpt`/`cursor` → Bridge → `codex` / Proxy auf `127.0.0.1`  
3. Kein Multi-Account-Hopping; ein Plan, ein User

ToS: nur persönlich, lokal — nicht als öffentlicher API-Dienst.

## Was wir *nicht* bauen (trotz Coolness)

- **10 Subscriptions rotieren = „Gott-AI“** — Verstoß gegen Anbieter-ToS; undurchsichtig. Stattdessen: Context-Handoff zwischen *unseren* Agents (haben wir schon Ansätze) + ggf. mehrere *eigene* API-Keys für Rate-Limits.
- **Chromium fork (ABP)** — Maintenance-Hölle. Lieber Ideen von [agent-browser](https://github.com/vercel-labs/agent-browser): Accessibility-Tree + Refs.
- Alles Hermes/Caduceus/Toolrush/Warpmux auf einmal — Branding ohne Runtime bringt nichts.

## Was wir von den Links *lernen* und wohin

| Quelle | Lehre | Connect-Fit |
|---|---|---|
| microsandbox | schnelle isolierte VMs | später optional; jetzt Docker behalten |
| openclaw-tune / claudecodex | Flat-Rate Plan via Proxy, Prompt klein | **Priorität 1** — Codex-Bridge |
| Agent-Browser-Vergleich | a11y-refs &gt; Pixel-Klick | Watch/Browser-Tools verbessern |
| E-Mail-Gist | Thread + `.ics` Worker | Manus-Mail-Pfad konkretisieren |
| API-Key-Gist | Cursor/Codex Auth statt doppelter API-Rechnung | `agent-api-keys` + Bridge |
| gpuview | Screen beschreiben | ComputerView/Screenshot → Vision-Tool |
| Hermes / Harness | strukturierter Agent-Lauf (Plan→Tools→Reflect) | „Hermes-Profil“ als Konvention, kein Fork |
| warpmux / Context | Session-Handoff wenn Context voll | Channel-Handoff + Memory-KV |
| UltraCode-Shim / Cloud-Code | schlanker Coding-Agent | optional Coding-Agent CLI |
| prompt-cache-skills | Prompt-Kompression | vor langen Routinen |
| PaperTrench | Paper-Trading Overlay | **Hyper Level 3** Modul (separat) |
| Pushary | Terminal vom Handy | PWA + CLI-Bridge remote |

## Minimalistischer Build-Reihenfolge

1. **Codex/ChatGPT-Bridge** (ein Agent kann deinen Plan nutzen)  
2. **Browser: a11y-snapshot Tool** neben Screenshot  
3. **Hermes-Profil** = feste Tool-Liste + Reflect-Schritt (Doku + Defaults, wenig Code)  
4. **Manus-Mail** echtes Ingest (von Simulate → IMAP/CF)  
5. **Hyper Paper-Mode** (L3) nur wenn Hyper-Company Fokus hat  
6. Mobile Terminal zuletzt  

## Antwort auf „kriegen wir das hin?“

**Ja — für dich persönlich, als Experiment.**  
Nicht als skalierbares Produkt mit fremden Subscriptions.  
Der witzige Informatiker-Beweis ist: **ein Agent in Connect antwortet über deinen Codex-Plan statt über `OPENAI_API_KEY`.** Alles andere ist Ausbau drumherum.

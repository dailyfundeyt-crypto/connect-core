# Connect — Gesamtplan: so gehen wir weiter

Ein Plan für dein **persönliches** Connect-Experiment.  
Quellen: [033](./033-connect-media-postgres.md)–[036](./036-wave-rakazo-hermes-eyes.md) und die Repos/Gists, die du geteilt hast.  
Zielbild: **wie Claude Code / Hermes orchestrieren** — präzise, schnell, nicht durcheinander — plus Augen, Hände, Codex-Plan, gutes Terminal.

---

## Nordstern (ein Satz)

Jeder Connect-Agent läuft im **Hermes-Profil** (klarer Tool-Loop), sieht das Netz (**Reach**), steuert Browser/Computer, spricht über **deinen Codex-/ChatGPT-Plan** oder Keys, und du bedienst das von Desktop **und** Handy gegen dieselbe API.

---

## Schon da (nicht neu bauen)

| Bereich | Stand |
|---|---|
| Mini-Ubuntu + Browser-Watch | Docker `agent-computer` |
| Bot-CLI-Panel (Queue) | UI da, Bridge noch dünn |
| MCP-Katalog + Permissions | Settings |
| Manus-Mail (Simulate) | Panel da |
| Media/Ordnung in Postgres | `connect_media` / KV |
| L1 Creative + Gemini-Test | läuft |
| Connect.exe → Downloads | Windows-Launcher |
| Cloud-Computer-Ansätze | teilweise |

---

## Architektur (was wir anstreben)

```
                    ┌─ Mobile PWA / App ─┐
User ──► Connect UI ┤                    ├─► dieselbe API
                    └─ Desktop / .exe ───┘
                              │
                    Hermes Agent Loop
                    (plan → tool → observe → compact → reply)
                              │
        ┌──────────┬──────────┼──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼
     Computer   Browser    Reach     Bot-CLI     MCP
     (Ubuntu)  (+use/a11y) (Augen)  (Blocks)   (Builder)
        │
   runtime: local | cloud  (ein Schalter, zwei Backends)
```

**Nicht:** zehn Frameworks forken. **Doch:** ein Loop, klare Permissions, schlanke Prompts.

---

## Phasen — Reihenfolge

### Phase A — Harness (Fundament)
**Warum zuerst:** ohne das gerät jede neue Fähigkeit durcheinander.

1. **Hermes-Loop-Guards** im bestehenden Bot  
   - Tool-Allowlist pro Agent  
   - Interrupt bei neuer Nachricht  
   - sichtbarer Mini-Plan / Todo (wie Claude Code)  
   - Context-Compress bei Limit  
2. **Permission-Gates** für Shell + Browser (Ask / Allow / Deny wie MCP)  
3. Kurzes **Hermes-Profil**-Prompt + Skill-Ordner-Konvention  

**Done wenn:** ein Agent einen Multi-Tool-Turn sauber durchzieht und du ihn mittendrin stoppen kannst.

### Phase B — Codex-Plan anschließen
**Dein Informatiker-Beweis.**

1. Desktop-Bridge: Bot-CLI Queue → lokales `codex` / Proxy (`127.0.0.1`)  
2. ChatGPT-Subscription-Auth (Muster claudecodex / opencode-codex-auth) — **ein** Account, persönlich  
3. Bootstrap/Heartbeat klein halten (openclaw-tune-Lehre)  
4. Optional: Cursor-Key nur für Cursor-CLI-Target  

**Done wenn:** Channel-Nachricht an „ChatGPT/Codex-Agent“ ohne `OPENAI_API_KEY` über deinen Plan beantwortet wird.

### Phase C — Terminal wie Wave
1. Command-**Blocks** (ein Befehl = eine Karte, Output streamen)  
2. Scrollback als Agent-Kontext  
3. Interrupt / Retry  

**Done wenn:** Bot-CLI sich wie ein echtes Terminal anfühlt, nicht wie eine Warteschlange.

### Phase D — Augen (Agent Reach)
1. Reach als Skill/Pack installierbar (`doctor` + Fallbacks)  
2. Karriere-Agents default: Web, GitHub, Suche, YT/X nach Bedarf  
3. Cookies nur lokal, keine Scraper selbst bauen  

**Done wenn:** „schau auf LinkedIn/X/GitHub nach …“ ohne neue Eigen-Tools geht.

### Phase E — Browser schärfen
1. a11y-Snapshot / Refs neben Screenshot (agent-browser-Idee)  
2. optional **browser-use** hinter dem Ubuntu-Browser  
3. Vision auf Screenshot nur wenn a11y nicht reicht  

**Done wenn:** Klicks über Element-Refs stabiler sind als reine Pixel-Steuerung.

### Phase F — Mobile + MCP-Builder (Rakazo-Muster)
1. PWA / Mobile-Client gegen laufende Connect-API  
2. MCP: „URL einfügen → Tools erscheinen“ (Builder-UX)  
3. Expo nur wenn PWA nicht reicht  

**Done wenn:** du vom Handy denselben Agenten siehst und eine MCP-URL anbinden kannst.

### Phase G — VM-Tiers (nur bei Bedarf)
| Job | Runtime |
|---|---|
| Normal | lokal Docker Ubuntu |
| Groß / lange | Cloud-VM (Oracle Free / Daytona / E2B) on demand |

Ein UI-Schalter `Computer: Lokal | Cloud`. Oracle erst, wenn lokale Jobs knacken.

### Phase H — Polish & Spezial
- Manus-Mail: Simulate → echtes Ingest  
- Hyper L3: Paper-Trading (PaperTrench-Ideen)  
- Paperclip-artige Statusleisten  
- Freeflow-Motion  
- Context-Handoff zwischen Agents wenn Fenster voll  

---

## Explizit nicht

| Idee | Warum nicht |
|---|---|
| 10 Subscriptions rotieren | ToS, Chaos |
| microsandbox statt Ubuntus | jetzt unnötig |
| Chromium-Fork (ABP) | Maintenance |
| Hermes/Qwen/Aiden parallel forken | ein Profil reicht |
| Alles gleichzeitig | zerbricht Fokus |

---

## Nächster konkreter Schritt

**Phase A erledigt** — [038](./038-phase-a-hermes-guards.md).  
**Phase B erledigt** — [039](./039-phase-b-codex-bridge.md) (Bot-CLI → Codex/Plan-Proxy).

**Als Nächstes Phase C:** Bot-CLI → Wave-artige Command-Blocks (Output streamen, Interrupt, Scrollback).

Detail-Notizen bleiben in [035](./035-research-codex-hermes-sandbox.md) und [036](./036-wave-rakazo-hermes-eyes.md); **dieser Plan ist die Arbeitsreihenfolge.**

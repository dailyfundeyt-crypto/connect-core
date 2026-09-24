# 044 — Bot-Shells: Hermes vs Manus (API), Beta = ZGPT/Grok/…

## Produktentscheidung (aktuell)

Jeder Connect-Agent ist **eine von zwei Varianten**:

| Variante | Runtime | Oberfläche |
| --- | --- | --- |
| **Hermes** (`connect`) | Connect AG-UI / eigene KI-API | Channel-Chat wie bisher |
| **Manus** | [Manus Open API v2](https://open.manus.ai/docs/v2/introduction) | Unser Chat → `task.create` / `task.sendMessage` |

**Beta** (experimentell, Create/Settings unter „Beta“): ZGPT (ChatGPT), Claude, Grok, Cursor, Lovable, Qwen.

Manus-Default: **kein** Browser-Embed, **kein** Mail. Pro Bot: Manus-API-Key unter API-Keys. Computer für Manus-Jobs: lokal Chrome **oder** Anchor-Cloud (MCP) — Manus-Minicomputer zählen wir nicht.

---



## Problem

Heute sind Manus, ChatGPT (ZGPT), Claude, Grok, Hermes usw. vor allem **Modell-Familien** + CLI-Queues ([025](./025-cli-manus-mail.md), [043](./043-agent-chrome-profile-box.md)).  
Der Produktwunsch: Beim **Anklicken eines Bots** bzw. beim **Senden aus dem Z-Menü (Composer)** öffnet sich die **echte App / Website** dieses Anbieters — mit eigenem Profil — und der Auftrag (Text + Bild) wird **injiziert**.

## Bot-Arten beim Anlegen

| Art | Laufzeit | Oberfläche |
| --- | --- | --- |
| Terminal-Bot | lokal | Bot-CLI Pane |
| Hermes / hausgemacht | lokal (Sandbox / Chrome) | Connect-Chat + Computer |
| ChatGPT (ZGPT) | lokal App | Desktop-App mit **Profil pro Bot** |
| Manus | Browser **oder** Mail-Cloud | Embed wie Unternehmen **oder** E-Mail-Roundtrip |
| Claude | Web **oder** lokale App | Embed im Z-Menü **oder** App-Injection |
| Grokbot | lokale Software | App öffnen + Auftrag injizieren |

Zusätzlich zu Computer-Runtime ([043](./043-agent-chrome-profile-box.md): Chrome-Profil · Sandbox lokal · Sandbox cloud) braucht jeder Bot:

- **`agentKind`**: `cloud` | `local`  
  - Cloud = läuft remote (z. B. Manus-Mail), auch ohne dauerhaftes Desktop.  
  - Local = Desktop / Host-Chrome / lokale App nötig.

## Manus — zwei Varianten

### A) Manus Browser (Fullscreen wie Unternehmen)

1. Bot-Familie = Manus, Modus = `browser`.  
2. Klick auf den Bot (oder Send im Channel): das **normale Chat-Z-Menü** weicht einer **Fullscreen-Embed**-Fläche (gleiche UX wie Unternehmen-Site / Lab-iframe).  
3. Quelle: offizielle Manus-Web-App, geladen in **Connect-Chrome mit eigenem `--user-data-dir` pro Bot** ([043](./043-agent-chrome-profile-box.md) / [041](./041-lab-native-chromium.md)) — eigener Login, eigene Session.  
4. Auftrag aus Unternehmen (Markieren + Aufgabe) **oder** Composer:  
   - Text (+ Bild) wird in das **Manus-Eingabefeld injiziert**.  
   - Prompt-Zusatz: *nutze Chrome / Browser Use für die Seite*.  
   - Optional Auto-Send.

**Technisch:** Desktop-Bridge (CDP / Playwright persistent context auf Agent-Chrome-Profil) steuert das Manus-DOM; Web-iframe allein kann Cross-Origin nicht tippen — deshalb Connect Desktop Pflicht für Injection (Preview im iframe ok).

### B) Manus Mail (Cloud)

Bereits angefangen in [025](./025-cli-manus-mail.md) / `ManusMailPanel`.

1. Bot-Einstellung: Mail-Adresse / Alias.  
2. Connect schreibt Auftrag als E-Mail **an** Manus.  
3. Antwort-Mail von Manus wird erkannt (Name/Alias) und als **Antwort im Z-Menü** gezeigt.  
4. Wiederholbare / Offline-taugliche Cloud-Aufträge ohne Browser-Session.

Regel: Ein Manus-Bot wählt in Settings **`delivery: browser | mail`** (nicht beides gleichzeitig als Default; Mail als Fallback wenn Desktop fehlt).

## ChatGPT (ZGPT) — App + Profil pro Bot

1. Auf dem PC: ChatGPT-Desktop (oder Wrapper) mit **mehreren Profilen** (User hat das bereits).  
2. Jeder Connect-Bot mappt auf **ein Profil-ID** (`zgptProfileId` in Bot-Settings).  
3. Klick / Send → Desktop öffnet **genau dieses Profil**, injiziert Text (+ Anhänge).  
4. Kein generisches „ein ChatGPT für alle“ — Isolation = Profil, analog Chrome-Profil pro Agent.

## Claude — Web oder lokal

| Modus | Verhalten |
| --- | --- |
| `web` | Claude.ai (o. ä.) im Z-Menü-Embed + Agent-Chrome-Profil |
| `local` | Claude-Desktop-App öffnen, Text/Bild injizieren |

Gleiche Inject-Pipeline wie Manus Browser / ZGPT, nur anderes Target.

## Grokbot

Wie ZGPT lokal: Klick / Send öffnet **Grokbot-Software**, Auftrag landet dort. Eigenes Profil/Instanz pro Bot wenn die App das hergibt.

## Composer-Flow (Z-Menü)

```
User tippt im Channel-Composer → Send
        │
        ├─ Bot.delivery = manus-browser / claude-web
        │     → Composer/Chat-Fläche → Embed der App
        │     → Inject text + attachments → optional auto-send
        │
        ├─ Bot.delivery = manus-mail
        │     → E-Mail raus → Antwort rein → Chat-Bubble
        │
        ├─ Bot.delivery = zgpt-app / claude-app / grok-app
        │     → Desktop startet App+Profil → Inject
        │
        └─ Bot.delivery = hermes / terminal
              → bisheriger Connect-Lauf / Bot-CLI
```

Unternehmen-Aufgabe ([042](./042-unternehmen-site-mark-agent.md)): derselbe Dispatch — Mark + Prompt gehen an Manus-Browser-Inject **oder** Mail, je nach Bot.

## Datenmodell (Settings pro Bot)

```ts
type AgentShell = {
  family: "hermes" | "terminal" | "manus" | "chatgpt" | "claude" | "grok" | …;
  residency: "local" | "cloud";       // Cloud- vs Lokal-Agent
  computer: AgentComputerPrefs;      // chrome | local | cloud + box (043)
  delivery:
    | "hermes"
    | "terminal"
    | "manus-browser"
    | "manus-mail"
    | "chatgpt-app"
    | "claude-web"
    | "claude-app"
    | "grok-app";
  /** ChatGPT Desktop profile id on this PC */
  zgptProfileId?: string;
  /** Manus mail alias (025) */
  manusMail?: { email: string; name: string };
  /** Official web URL for browser shells */
  embedUrl?: string;
};
```

## Reihenfolge (Slices)

1. **Shell-Settings UI** — residency + delivery pro Bot; Create-Wizard wählt Familie → Defaults.  
2. **Manus Browser Embed** — Channel-Detail: bei `manus-browser` Fullscreen-iframe/Desktop-Chrome statt Transcript; Peek zeigt Manus statt leerem Chrome-Fehler.  
3. **Inject Bridge** — Connect Desktop: CDP → Fokus Eingabefeld → type + attach files (Manus zuerst).  
4. **Manus Mail Cloud** — echte Mailbox-Sync statt Simulate; Antworten in Channel.  
5. **ZGPT Profil-Map** — Desktop listet Profile, Bot speichert `zgptProfileId`, open+inject.  
6. **Claude web/local + Grokbot** — gleiche Bridge, andere Targets.

## Abgrenzung

- Ohne Connect Desktop: Browser-Inject und lokale Apps gehen nicht — klarer Fallback auf Mail (Manus) oder Hinweis „Desktop nötig“ (wie Chrome-Profil-Peek heute).  
- Cross-Origin-iframe kann Manus nicht steuern — Embed = Anzeige; Steuern = Host-Chrome + CDP.  
- Kein zweites Computer-System: Shell nutzt dieselben Chrome-Profile / Sandboxes aus [043](./043-agent-chrome-profile-box.md).

## Bezug

- [025](./025-cli-manus-mail.md) Manus Mail + CLI  
- [041](./041-lab-native-chromium.md) Connect Desktop / Chromium  
- [042](./042-unternehmen-site-mark-agent.md) Mark → Auftrag  
- [043](./043-agent-chrome-profile-box.md) Chrome-Profil + Sandbox-Tiers  

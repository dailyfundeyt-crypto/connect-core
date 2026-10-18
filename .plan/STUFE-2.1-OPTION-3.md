# Stufe 2.1 · Option 3 — Antigravity-Only für Web-Tasks

Stand: 2026-10-18 21:00 · Status: **LEBT** (E2E-verifiziert mit echten Webseiten)

## Was war das Problem

`browser-use` Sidecar funktioniert für Codex/Claude prinzipiell, scheitert aber auf
Windows an der OpenAI-Codex-Sandbox (`CreateProcessWithLogonW failed: 1385`). Die
Codex-Sandbox verhindert das Spawnen externer Subprozesse (PowerShell/Python), also
kann Codex/Claude `browser-use` nicht aufrufen, obwohl das Sidecar selbst funktioniert
(separater Smoke-Test: `browser-use browser-action.py` → `Example Domain` ✅).

## Die Entscheidung: Option 3

User hat **Option 3** gewählt: Antigravity bekommt alle Web-Tasks, Codex/Claude bleiben
für Code/Schreiben. Grund:

1. **Antigravity hat ein eingebautes Browser-Tool** — die CLI klickt selbst, kein
   externer Subprozess, keine Sandbox-Probleme. Das Tool heißt `read_url_content`,
   `open_browser_url`, `browser_click_element`, `capture_browser_screenshot` usw.
   (siehe `agy` init-Event).
2. **Codex/Claude-CLI auf Windows** haben die Sandbox-Beschränkung, die nicht in
   unserer Hand liegt. Wir kämpfen nicht länger dagegen.
3. **Im UI kann der User pro Agent wählen** — die Quick-Actions (Codex/Claude/
   Antigravity) sind sichtbar, der User entscheidet selbst, ob er einen
   Web-Task vorhat.

## Was wurde implementiert

### 1. `looksLikeWebTask(text)` und `shouldSuggestAntigravity()` (Frontend)

`apps/app/src/lib/agents/model-provider-dispatch.ts`:

```ts
const WEB_TASK_KEYWORDS = [
  "öffne", "offne", "navigiere", "klicke", "screenshot", "lade",
  "besuche", "geh auf", "surfe", "browser", "webseite",
  "scrape", "formular", "einloggen",
  "open url", "browse", "navigate to", "click on", "visit",
  "go to", "fetch url", "screenshot", "login to",
  "http://", "https://",
];

export function looksLikeWebTask(text: string): boolean { ... }
export function shouldSuggestAntigravity(agentProvider, text): boolean { ... }
export const ANTIGRAVITY_WEB_HINT = "...";
```

Die Liste ist absichtlich breit. False-positive (UI zeigt einen Hinweis) ist harmlos,
false-negative (User klickt sich durch die Sandbox-Fehler) ist die Hölle.

### 2. UI-Hint im Agent-Model-Panel

`apps/app/src/components/agent-hub/agent-model-panel.tsx`:

Wenn der User **Codex-CLI** oder **Claude-CLI** als Provider wählt, erscheint eine
gelb-gerahmte Hinweis-Box mit:

> **Hinweis:** Für Web-Tasks (öffnen, klicken, Screenshots) ist **Antigravity** die
> bessere Wahl — der hat ein Browser-Tool eingebaut und kämpft nicht mit der
> Windows-Sandbox.
> [Button: Zu Antigravity wechseln]

Mit `data-testid="agent-model-web-hint"` und `agent-model-web-hint-switch` für
Tests.

### 3. Antigravity headless: `--dangerously-skip-permissions`

`apps/server/src/agent-hub/cli-model.ts`:

In `argsFor(kind: "antigravity", ...)` wird jetzt zusätzlich
`--dangerously-skip-permissions` gesetzt. Grund: Antigravity fragt im Print-Mode für
jedes Tool (`read_url_content`, `open_browser_url`, `search_web` …) eine Permission
ab, die es in non-interactive nicht beantworten kann — der Stream stirbt mit
`jetski: no output produced — a tool required the "read_url" permission that
headless mode cannot prompt for, so it was auto-denied`.

Mit `--dangerously-skip-permissions` akzeptiert die CLI alle Tools automatisch. Die
Sicherheits-Bar bleibt das Login-Token von Antigravity selbst, das Flag nimmt nur
den UI-Prompt weg, der im Chat-Use-Case unbenutzbar ist.

## E2E-Verifikation

Drei Live-Tests mit `agy -p --output-format stream-json --dangerously-skip-permissions`:

| URL | Dauer | Ergebnis |
|---|---|---|
| `https://example.com` | 12,6 s | "Der Titel der Seite https://example.com lautet „Example Domain"." |
| `https://www.heise.de` | 115 s | "Die aktuelle Hauptüberschrift: Barrierefreiheit mit Bluetooth – wie weit ist Auracast wirklich?" |
| `https://en.wikipedia.org/wiki/Antigravity` | 36 s | Erklärung von Antigravity (Physik) |

Alle drei öffnen die Seite echt im Browser (Tool: `read_url_content`), parsen den
Inhalt und antworten mit `step_update.agent_response`.

## Was bleibt

- **`looksLikeWebTask` im Composer-Hint anzeigen** (Stufe 1.1 / Composer-Refactor)
- **Tool-Tracking**: Antigravity zeigt aktuell nur `[Tool: read_url_content]` als
  Hinweis. Stufe 1.2 Sidecar-Engine kann den Screenshot davon abgreifen.
- **Echte Sandbox-Diskussion auf GitHub upstream bei OpenAI** (`CreateProcessWithLogonW
  1385` ist ein Bug, kein Feature).

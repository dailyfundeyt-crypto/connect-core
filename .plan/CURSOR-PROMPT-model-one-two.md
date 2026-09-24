# CURSOR PROMPT — Model One / Model Two in Connect

Paste this entire file into **Cursor**. Implement in Connect / Connect (UI `:3010`, API `:3001`, Bot-Computer `:4100`). Prefer small diffs. Reuse existing Lab / Manus / Codex Sandboxen work — do not invent a second control plane.

## Product model (Stefan)

| Name | What it is | Visibility |
| --- | --- | --- |
| **Model One** | External provider, fully invisible in the background | User sees only chat field + file upload |
| **Model Two** | Local provider = our **Hermes**, also hidden in the background | Same UX: chat + upload only |

There is already a settings control **“Model Provider”**.

When **external** (Model One) is selected, the user chooses one of two execution paths:

1. **Terminal variant** — includes **Manus** and other CLI/headless agents (e.g. `codex exec`, `browser-use`, Grok Build `grok -p` if wired later).
2. **API-Key variant** — HTTP APIs (e.g. Manus Open API `x-manus-api-key`, xAI, Z.AI, OpenAI-compatible).

The **stored key** decides whether Manus-specific features activate (Gmail connector / Mail Manus / task.create, etc.). No key ? no Manus cloud features (or documented local fallback only).

## Non-negotiable UX

- Terminal / CLI / sandbox / browser-use run **invisibly** in the background — no agent TUI, no VS Code Codex chat panel as the primary UI.
- The user-facing surface is: **chat composer + file upload** (and settings for provider / keys).
- Optional: left/right split only where Lab already does (e.g. Manus Voll-Chrome). Default chat should feel like a normal messenger, not an ops console.

## Build on existing assets

On Stefan’s PC:

```
C:\Users\Kunc GmbH\Desktop\Codex Sandboxen\
  Invoke-Codex.ps1
  connect-codex-instances.json
  CONNECT-CODEX.md
  CURSOR-PROMPT-codex-integration.md   (related: headless Codex)
```

In Connect / Connect (already or partially done):

- Manus Lab / Plan `046-manus-lab-split` pattern: Cloud Manus via `/api/manus`, Voll-Chrome for iframe-hostile sites, repeatable tasks ? Mail Manus when key present
- Lab browser (`engine: embed | full`), Bot-Computer `:4100`
- Ports: UI `:3010`, API `:3001`

## Architecture to implement

```
Settings ? Model Provider
  +- Model Two: Hermes (local)     --? background Hermes process/API
  +- Model One: External
        +- Terminal path           --? spawn CLI (Codex Invoke-Codex.ps1, Manus CLI if any,
        ¦                               browser-use, …) with hidden window / no TUI
        +- API-Key path            --? HTTP client; Manus features iff MANUS_API_KEY (or
                                        settings-store key) is set

Chat UI (composer + file upload)
  +- POST message (+ attachments) ? provider router ? background agent
       +- tools: browser-use / sandbox / bot-computer (background only)
       +- stream or poll reply ? chat transcript only
```

## Settings requirements

1. Keep / extend **Model Provider** setting:
   - `hermes` | `external`
2. When `external`:
   - sub-setting: `terminal` | `api_key`
   - if `api_key`: secure fields for keys (at least Manus; leave hooks for other providers)
   - Manus key UI in settings area (masked); store via Connect secrets / env (`MANUS_API_KEY`) — never log raw keys
3. When Manus key present and path allows: enable Mail Manus / `task.create` / Gmail connector behaviors already documented for Manus Lab
4. When Manus key absent: chat still works for non-Manus terminal/API providers; Manus-only buttons disabled with clear copy

## Chat ? background contract

- Composer sends **text + uploaded files** to the selected backend.
- Terminal path: pass files as paths or staging dir; invoke e.g. `Invoke-Codex.ps1 -Instance cli-1 -Prompt …` or Manus API after upload; never show the PowerShell window to the user (hidden / CreateNoWindow / background job).
- API path: upload via provider file APIs when needed (Manus `file.upload`, etc.).
- **browser-use** and sandbox run only as agent tools in the background; results appear as chat messages / optional Lab pane, not as a second “ops” UI unless user opens Lab deliberately.

## Hermes (Model Two)

- Treat Hermes as the local background provider already intended in Stefan’s stack.
- Same chat UI; router sends to Hermes endpoint/process instead of external.
- Document discoverable endpoint or process start command in Plan note if not already in repo.

## Implementation steps (Cursor)

1. Locate existing Model Provider settings UI and wire enums: `hermes` | `external` + `terminal` | `api_key`.
2. Add settings UI for Manus (and generic) API key entry; persist securely; expose `GET /api/…/provider-status` without leaking secrets (`hasManusKey: true/false`).
3. Implement provider router on API:
   - `POST /api/chat` or extend existing channel send path with `provider` + attachments
   - Terminal branch: call Codex Sandboxen scripts / headless CLIs
   - API branch: Manus `/api/manus` when key set; other providers as stubs or existing clients
4. Ensure terminal processes are headless (no visible console for normal chat sends).
5. Wire browser-use / bot-computer only as background tools for the active provider.
6. Align Manus repeatable tasks with “key present” gate.
7. Add short Plan markdown, e.g. `Plan/047-model-one-two.md`, for Christopher: Model One vs Two, terminal vs API, Manus key gate.
8. Smoke-test checklist in the PR/summary.

## Acceptance criteria

- [ ] Settings show **Model Provider** with Model Two = Hermes and Model One = External.
- [ ] External offers **Terminal** (incl. Manus-as-CLI/agent path) vs **API-Key**.
- [ ] Manus API key can be entered in settings; status endpoint reports presence without revealing the key.
- [ ] With Manus key set, Manus-specific features (e.g. Mail Manus / task.create) work; without key they do not silently pretend to work.
- [ ] Chat field + file upload is the only required user surface for sending work; agent TUI is not required.
- [ ] Terminal runs are invisible (no flashing console for happy path).
- [ ] browser-use / sandbox / bot-computer operate in the background when the agent needs them.
- [ ] Codex path reuses `Desktop\Codex Sandboxen\Invoke-Codex.ps1` + `CODEX_HOME` instances (`cli-1`…), not Electron desktop profiles, not VS Code Extension.
- [ ] Hermes path works as local background provider with the same chat UI.
- [ ] Documented smoke: one Terminal send, one API-Key Manus send (with key), one Hermes send.

## Out of scope

- Replacing Lab browser UX wholesale
- Driving ChatGPT Desktop Electron windows as the primary Model One path
- Inventing a new Manus local agent (Cloud / API / CLI only)

## Deliverables

1. Code + settings wiring in Connect/Connect  
2. Plan note `047` (or equivalent)  
3. Verification commands and UI click-path for Stefan  

When finished, summarize files touched and how to test Model One Terminal, Model One API (Manus key), and Model Two Hermes.

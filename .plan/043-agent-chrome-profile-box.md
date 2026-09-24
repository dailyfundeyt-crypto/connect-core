# 043 — Pro Bot: Chrome-Profil + Sandbox-Box (leiser als „laute“ Sandboxes)

## Problem heute

Jeder Bot kriegt oft eine **volle Ubuntu-Sandbox** (`agent-computer`) — schwer, laut, viel RAM/CPU auch für simple Browser-Jobs.  
Gleichzeitig brauchen Lab / Unternehmen **echtes Chromium** (Extensions, Login) — das geht nicht im Web-iframe ([041](./041-lab-native-chromium.md)).

## Idee

**Nicht jeder Job = ganze Sandbox.**  
Jeder Agent bekommt ein **eigenes Chrome-Profil** (wie mehrere Chrome-User). Der Agent steuert entweder:

| # | Modus | Was | Wann |
| --- | --- | --- | --- |
| 1 | **Chrome-Profil** (**Standard**) | Host-Chrome mit `--user-data-dir` pro Agent | Normale Web-Aufträge |
| 2 | **Sandbox lokal** | Docker Mini-Ubuntu auf dem PC | Isolation, Installs |
| 3 | **Sandbox cloud** | Anchor / Oracle-ähnlich | Schwer, remote |
| 4 | **Watch** | Zusehen (Screenshot/Stream) | Augen ohne Steuerung |
| 5 | **Pick a Box** | small / medium / **large (~24 GB)** | Nur bei Sandbox-Runtimes |

**Alle drei Computer-Modi bleiben immer wählbar** — Chrome ist nur der Default. Komplizierte Tasks → lokal oder cloud (+ Box-Größe). Oracle = cloud + `large`.

## Chrome-Profil pro Agent

```
~/.connect-chrome-profiles/
  u:{userId}/
    agents/{agentId}/     ← Cookies, Extensions, Login dieses Bots
    lab/                  ← gemeinsames Lab-Profil (optional)
```

- `open-chrome` / Desktop: `--user-data-dir=…/agents/{agentId}`
- Fernsteuern: CDP an dieses Profil (browser-use / Playwright persistent context)
- Isolation zwischen Bots = **Profil-Isolation**, nicht zwingend Container

Grokbot u. a. behalten ihre bestehende Sandbox, wenn `runtime: sandbox-*` — Chrome-Profil ist die **Standard-Leisestufe**.

## Watch von außen

Unabhängig vom Runtime:

1. Agent arbeitet in Chrome-Profil oder Sandbox  
2. Connect streamt Screenshot / Live-View (wie Watch heute)  
3. User kann Take-the-wheel (headed) oder nur zusehen  

„By the way“-Überwachung = Watch-Pane an denselben Runtime gekoppelt, kein zweiter Stack.

## Box-Tiers (Pick a Box)

| Tier | RAM-Ziel | Default runtime |
| --- | --- | --- |
| `small` | ~2–4 GB | chrome (Profil) |
| `medium` | ~8 GB | sandbox-local |
| `large` | ~24 GB | sandbox-cloud / große lokale VM |

Regel aus [036](./036-wave-rakazo-hermes-eyes.md): **ein API**, UI „Computer: …“, Tiers nur als Kapazität — nicht drei Plattformen.

## Reihenfolge

1. **Desktop + Profil-Pfad pro Agent** (Connect.exe / Tauri) — leise Browser-Steuerung  
2. Agent-Settings: Runtime `Chrome-Profil | Sandbox lokal | Sandbox cloud` + Box-Größe  
3. Watch immer an Runtime binden  
4. Large-Box nur wenn Jobs wirklich stoßen  

## Abgrenzung

- Web-Tab bleibt Preview + Markieren; **Steuern** nur Desktop/Sandbox.  
- Kein CEF von Null in dieser Phase — Host-Chrome mit Profil + CDP reicht als Slice.

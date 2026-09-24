# Where state lives in this app

Everything the app remembers lives in one of three places:

1. **Server** — `app/src/routes/api/*` (Convex / Hono-style). Anything you see across devices lives here.
2. **Browser `localStorage`** — single device, single origin, fast. All keys are listed in [`app/src/lib/storage/keys.ts`](./app/src/lib/storage/keys.ts).
3. **URL / search params** — ephemeral, shareable. Read by the route files under `app/src/routes/`.

## The rules

- **No raw `localStorage` strings** in components. If you need a new key, add a constant to `STORAGE_KEYS` and import it. A grep for the string is then an audit trail.
- **No hand-rolled `JSON.parse(getItem(...))`**. Use `readJSON` / `writeJSON` from `lib/storage/safe-storage.ts` — they handle the missing-key, parse-fail, and quota-exceeded cases the same way everywhere.
- **Subscribe via `useStoredValue`** when a component needs to react to a change made elsewhere (another tab, another component, the same user editing their profile). The raw `window.addEventListener` dance is for one place: the publisher.

## Quick map (subset — full list in `STORAGE_KEYS`)

| Constant | Key | What lives here |
| --- | --- | --- |
| `STORAGE_KEYS.activeCompanyId` | `connect.activeCompanyId` | Which company the user is in. Read in 4+ places. |
| `STORAGE_KEYS.theme` | `connect.theme` | Dark / light. |
| `STORAGE_KEYS.locale` | `connect.locale` | i18n. |
| `STORAGE_KEYS.labPrefs` | `connect.lab.prefs` | Tabs, recents, layout for the level-3 Browser shell. |
| `STORAGE_KEYS.agentApiKeys` | `connect.agent-api-keys` | Per-agent API keys. |
| `STORAGE_KEYS.agentGlobalApiKeys` | `connect.global-api-keys` | Shared/global API keys. |
| `STORAGE_KEYS.localProfile` | `connect.local-profile` | Display name + avatar URL for the user menu. |
| `STORAGE_KEYS.shortcuts` | `connect.shortcuts` | Hotkey map (legacy prefix, kept for migration). |

## How to migrate an existing file

1. Find every `window.localStorage.getItem("...")` and `window.localStorage.setItem("...")` in the file.
2. Add the raw string to `STORAGE_KEYS` if it is not there yet.
3. Replace the raw string with the imported constant.
4. Replace `const raw = ...; JSON.parse(raw)` with `readJSON<T>(KEY)`.
5. Replace `window.localStorage.setItem(KEY, JSON.stringify(...))` with `writeJSON(KEY, ...)`.

That is the whole migration — five minutes per file, no behaviour change.

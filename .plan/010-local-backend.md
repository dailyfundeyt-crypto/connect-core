# Local backend (Postgres / Supabase-role)

Connect stores durable state in **local Postgres**, not a remote database.

## What runs

| Piece | Where | Role |
| --- | --- | --- |
| Postgres + pgvector | Docker `connect-postgres` on `127.0.0.1:5432` | Agents, channels, sessions, audit |
| App API | Bun server on `SERVER_PORT` (default 3001) | Backend HTTP |
| Vite app | `APP_PORT` (often 3010 in this environment) | UI |

`DATABASE_URL` in `.env`:

```
postgres://connect:connect@localhost:5432/connect
```

That is the same role a local Supabase database would play. The `supabase/`
folder holds a CLI project (`config.toml`) so you can grow into Auth / Storage
later without changing the data plane — do **not** point Connect at
`*.supabase.co` or any hosted project.

## Health

```bash
curl -s http://127.0.0.1:3001/health   # {"status":"ok"}
docker exec connect-postgres-1 pg_isready -U connect
```

## External connections (disabled in UI)

Connect no longer offers UI for:

- Remote AG-UI agent endpoints
- Composio catalogue / OAuth connect flows
- Company SAML / OIDC identity providers
- Settings → Connected accounts vendor linking

Leave `COMPOSIO_API_KEY` empty. Do not register SSO providers for local use.

## Optional: full Supabase CLI stack

`npx supabase start` boots its own Postgres (default host port **54322**) and
would conflict with Connect's compose DB if you remapped to 5432. Prefer the
compose Postgres above. Use the CLI only if you need Studio / GoTrue beside
Connect, and keep `DATABASE_URL` on `connect-postgres`.

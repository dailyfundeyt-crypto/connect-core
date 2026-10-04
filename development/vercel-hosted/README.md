# Connect hosted (Vercel Functions + Supabase) - preview kit

Web UI (static) + the Connect server (`apps/server`) as ONE Vercel Function (Bun runtime, fra1), database =
Supabase project `connect-core` (Frankfurt, free plan). Desktop and web share one account and one database.

## Pieces in the repo
* `apps/server/src/vercel-entry.ts`: function entry (`export default { fetch }`), sets serverless mode.
* `apps/server/src/serverless-flag.ts`: `CONNECT_SERVERLESS=1` disables the long-running parts in `index.ts`:
  LISTEN listeners, sweeps, handoff/reaper/summary loops and `Bun.serve`.
* `apps/server/src/db/client.ts`: `sslmode=` in DATABASE_URL turns into Bun SQL `tls`. `DATABASE_POOL_MAX` sets
  the pool size.
* This folder:
  * `vercel.json`: rewrites `/api/*` to the function and serves the SPA from `public/`.
  * `package.json`
  * `vercelignore.txt`: copy it as `.vercelignore`.
  * `hosted-env.ts`: builds the env JSON from `.env` + `.env.supabase`.
  * `migrate-supabase.ts`: migration runner.

## Build + deploy a preview (Windows, from the repo root)
```
$out = "$env:TEMP\connect-web-deploy"
# 1) UI
cd apps\app; bun run build; cd ..\..
robocopy apps\app\dist "$out\public" /MIR
# 2) server bundle
cd apps\server; bun build src/vercel-entry.ts --target=bun --format=esm --outfile "$out\api\index.js"; cd ..\..
# 3) tenant package + config
robocopy apps\examples\fintech "$out\tenant" /MIR
copy development\vercel-hosted\vercel.json, development\vercel-hosted\package.json $out
copy development\vercel-hosted\vercelignore.txt "$out\.vercelignore"
# 4) env (once per target; secrets via stdin, never on the command line)
bun development\vercel-hosted\hosted-env.ts . connect-kunc-preview.vercel.app "$env:TEMP\hosted-env.json"
#    -> for each key: <value> | vercel env add <KEY> preview --sensitive ; then delete hosted-env.json
# 5) deploy (preview only) + alias
cd $out; vercel deploy --scope stefans-projects-e40bb777
vercel alias set <deployment-url> connect-kunc-preview.vercel.app --scope stefans-projects-e40bb777
```
Production later: `vercel promote <deployment> --scope stefans-projects-e40bb777`. Before that:
* production env vars
* the production URL in BETTER_AUTH_URL, TRUSTED_ORIGINS, CONNECT_APP_URL and CONNECT_PUBLIC_URL
* the Google OAuth redirect URI `<url>/api/auth/callback/google` and the JS origin

## Supabase
* Owner role `connect_app`:
  * Login, no superuser.
  * Owns all Connect tables and the `drizzle` schema.
  * Search path `public, extensions`. `vector` is in `extensions`.
* RLS is on for all tables, with no policies, and the anon/authenticated grants are revoked. The PostgREST/Data
  API therefore exposes nothing; only the server, as owner, reads and writes.
* After new migrations: `bun development\vercel-hosted\migrate-supabase.ts .`, then run
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and revoke the grants on the new tables.
* Pooler: session mode on port 5432, which has a small pool on the free plan. Keep `DATABASE_POOL_MAX` low:
  2 per function, about 6 for a local server.

## Not available hosted (needs the desktop/local server)
* WebSocket push (channel activity, computer live view).
* Background loops (handoff, summaries, routines).
* Agent Chrome via CDP, adb, Invoke-Codex, supervisor and agent-computer.

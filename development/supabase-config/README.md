# Local Supabase project

This folder was created with `supabase init` so Connect can treat the
**local Postgres** as a Supabase-shaped data plane without talking to any
hosted Supabase project.

Connect's real database is Docker service `postgres` (`connect-postgres`),
wired through `DATABASE_URL` in `../.env`. See `../Plan/010-local-backend.md`.

Uploaded Connect logos and workspace order sync into tables `connect_media`
and `connect_workspace_kv` (see `../Plan/033-connect-media-postgres.md`), so
another localhost against the same DB gets the same files.

Do not set `SUPABASE_URL` to `https://*.supabase.co` for this deployment.

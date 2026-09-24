# Connect media in local Postgres (Supabase-shaped)

Logos, banners, bot avatars, companies, groups and sidebar order used to live
only in **browser localStorage**. That is why another localhost (or a fresh
browser profile) never saw your uploads.

They now sync into the **local Postgres** that Connect already uses as its
Supabase-shaped data plane (`DATABASE_URL` → Docker `connect-postgres`).

## What is stored

| Kind | Table / path |
| --- | --- |
| Company logos & banners, bot avatars (bytes) | `connect_media` → served as `/api/connect/media/:id` |
| Companies, projects, order, avatar URL map | `connect_workspace_kv` via `/api/connect/workspace` |

Not a hosted `*.supabase.co` project — same DB as agents/channels. See
`Plan/010-local-backend.md`.

## How to use

1. Run migrations (already part of `./START.sh`):

```bash
cd Connect/server && bun --env-file=../.env drizzle-kit migrate
```

2. Open the app, upload logos / rearrange groups as usual. After ~1s they are
   written to `connect_media` / `connect_workspace_kv` (not only localStorage).
3. On another machine or localhost **with the same `DATABASE_URL`**, open the
   app once — hydrate overwrites localStorage from Postgres, so logos and order
   appear even in a fresh browser profile.

Check: `SELECT count(*) FROM connect_media;` should grow after each upload.

## Migrate existing localStorage images

First visit after upgrade uploads any remaining `data:` URLs into `connect_media`
and replaces them with `/api/connect/media/…` links, then saves the workspace.

## Optional full Supabase Storage

If you later run `npx supabase start` for Studio/Storage, keep
`DATABASE_URL` on `connect-postgres` (port 5432). Do not point Connect at a
hosted Supabase project for this deployment.

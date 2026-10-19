# Flux

Flux is a standalone TanStack Start application in this folder. `source/` is the shared full application code; Connect mounts its original route tree through `app.tsx`, while this folder's Vite configuration runs it as a separate web app. Both entry points use the same pages and features.

## Run and deploy independently

From this folder, run `bun install`, `bun run dev`, or `bun run build`. For Vercel, import the Connect repository and set the project's **Root Directory** to `apps/app/src/company-apps/modules/flux`. Vercel can then deploy Flux separately from Connect and rebuild it whenever this folder changes. The TanStack Start server is built with Nitro for Vercel Functions.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` for local work and in the Vercel project environment settings for deployments. These are public Supabase client credentials, not service-role secrets. Without environment values, Flux still lets you enter and save a Supabase project's URL and anon key in the app. The database schema used by Flux is in `supabase/schema.sql`; apply it to the separate Supabase project and enable Google under Authentication → Providers. Add the deployed app's domain to Supabase's OAuth redirect URLs.

The standalone app uses its own Supabase project for sign-in and persisted data. Embedded in Connect, it receives Connect's authenticated identity and scopes its local product state to the selected company. This keeps the same Flux code usable in both places; the embedded mode does not redirect to a second app or use an iframe.

## Brand

`public/flux-logo.png` is Flux's logo and is served by both the standalone app and Connect's build.

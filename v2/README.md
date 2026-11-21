# Living Word Lyrics v2

This is an isolated, deployable v2 application. Nothing here modifies or depends on the v1 runtime, so the current Render-compatible application remains available while v2 is built.

## Why this architecture

- **Cloudflare Pages:** hosts the Vite build as static files. No Worker or server is needed.
- **Supabase Postgres:** replaces the non-persistent SQLite database.
- **Supabase Auth:** replaces the environment-variable admin account and JWT cookie.
- **Supabase Row Level Security:** makes albums and songs public to read, but editable only by users in `admin_users`.

The browser must use only the publishable key. The service-role key is for the one-time import script and must never be exposed in frontend code or a public build environment variable.

## Initial setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql` in its SQL Editor.
3. In Supabase Auth, create the first admin user (email/password is sufficient).
4. Run `supabase/migrations/002_slim_public_queries.sql` as well. It adds the `has_lyrics` computed column and the `search_songs` function, which keep lyric bodies out of list and search responses. The app still works without it, but it downloads more data.
5. Add that user to the admin allow-list in the SQL Editor:

   ```sql
   insert into public.admin_users (user_id)
   values ('the-auth-user-uuid');
   ```

6. Copy `.env.example` to `.env` and add the project URL plus service-role key.
7. From this directory, run `npm install`, then `npm run migrate:data`.

The importer upserts IDs from `../backend/lyrics.db`; it can be safely re-run before go-live.

## Run locally

```bash
npm run dev
```

The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`. It uses Supabase Auth for the admin login, Row Level Security for database writes, and a browser-based DOCX parser—no Express server, SQLite file, or Python runtime is required.

## Deploy (Cloudflare Pages)

Create a **Pages** project (Workers & Pages → Create → **Pages** → connect to Git). Do not create a Worker: a Worker project runs `npx wrangler deploy`, which fails for this app.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None (or Vite) |
| Root directory | `v2` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Deploy command | leave empty |
| Node version | `20` (pinned by `.nvmrc`) |

Add these variables to **both** Production and Preview, then redeploy:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Never add `SUPABASE_SERVICE_ROLE_KEY`, the database password, or a connection string to Pages.

Routing: there is deliberately no `404.html` and no `_redirects`. With no top-level `404.html`, Pages serves `index.html` for every unknown path, so deep links such as `/songs/1` or `/admin` work on hard refresh. (Cloudflare ignores the usual `/* /index.html 200` rule as a redirect loop.) `public/_headers` caches fingerprinted `/assets/*` files for a year.

`netlify.toml` and `vercel.json` are kept for those hosts but are not used by Cloudflare.

## Deferred server-only feature

Google Analytics reporting is intentionally not included in the static v2 build: its service-account key must stay server-side. Add it later through a protected Cloudflare Pages Function if the dashboard analytics panel is still needed.

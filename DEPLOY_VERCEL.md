# Deploying to Vercel

This is a **TanStack Start (SSR)** app built with Nitro. On Vercel it builds with
the Nitro **`vercel`** preset (set in `vercel.json`) and outputs to `.vercel/output`.

## 1. Import the repo

1. Go to https://vercel.com/new and import this Git repository.
2. Framework preset: **Other** (leave it — `vercel.json` handles the build).
3. Build command: `bun run build` (already set in `vercel.json`).
4. Install command: `bun install` (already set).

## 2. Add Environment Variables

In **Vercel → Project → Settings → Environment Variables**, add these
(copy the values from your local `.env`). Set them for **Production**,
**Preview**, and **Development**:

| Name | Purpose |
| --- | --- |
| `MAPBOX_ACCESS_TOKEN` | 3D map + metro + water (public `pk.` token) |
| `GOOGLE_MAPS_API_KEY` | Satellite view |
| `SUPABASE_URL` | Supabase backend |
| `SUPABASE_PROJECT_ID` | Supabase backend |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `VITE_SUPABASE_URL` | Client-side Supabase |
| `VITE_SUPABASE_PROJECT_ID` | Client-side Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client-side Supabase |
| `NITRO_PRESET` | `vercel` (also set in `vercel.json`, but harmless to add) |

> The map keys are publishable — restrict them by HTTP referrer in the
> Mapbox / Google Cloud consoles to your Vercel domains.

## 3. Deploy

Click **Deploy**. Every push to the connected branch will redeploy automatically.

## Notes

- Do **not** commit real secrets beyond the already-committed publishable keys.
- If the build ever falls back to the Cloudflare preset, ensure `NITRO_PRESET=vercel`
  is present in the Vercel build environment — Nitro honours it above all else.

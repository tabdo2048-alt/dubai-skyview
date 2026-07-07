
# Dubai Real Estate Platform — Phase 1 (MVP + Mapbox 3D)

Full spec is large. This plan delivers a **shippable v1** matching your "MVP + Mapbox 3D toggle" scope. Three.js overlays (water, boats, clouds), the metro system, favorites, language, dark mode toggle, and admin analytics are **explicitly deferred** to later phases.

## What ships in Phase 1

**Public site**
- Fullscreen map layout: collapsible left sidebar (project list + filters) + map canvas.
- Default view: Google Maps JS API, satellite, centered on Downtown Dubai, bounds-restricted to Dubai.
- Premium animated markers (custom glass pins), clustering, glow on selected.
- Floating "3D View" toggle button (top-right). Clicking triggers a cinematic camera transition: current center/zoom is handed to Mapbox GL JS, which flies from top-down → pitched cinematic view with 3D buildings + terrain. Toggling back reverses.
- Liquid Glass popup on marker click with all requested fields (name, developer, community, starting price, beds, completion date, payment plan, description, main image, gallery, amenities, View Details / WhatsApp / Book Viewing buttons).
- Project detail route `/projects/$slug` with full gallery, video embed, 360 embed, brochure download.
- Sidebar filters: category (Apartment/Villa/Townhouse/Penthouse/Studio), status (Ready/Off Plan), community chips (Downtown, Marina, Palm, Business Bay, Dubai Hills, Creek Harbour, etc.), price range, bedrooms, search box.
- Navbar: logo, Projects, Communities, Developers, Satellite/3D toggle mirror, Search, Login.
- Communities and Developers index pages (list + counts, link back to filtered map).

**Admin (`/_authenticated/admin`)**
- Email/password login via Lovable Cloud, role gated (`admin` role in `user_roles` table).
- CRUD for: projects, developers, communities.
- Image/video/brochure upload to Lovable Cloud Storage.
- Coordinate picker (click map to set lat/lng).
- Featured toggle, status, category management.

**Design**
- Emerald Prestige palette (`#064e3b`, `#0d7a5f`, `#c9a84c`, `#f5f0e0`), Instrument Serif headings + Work Sans body.
- Liquid Glass: layered translucency, backdrop-blur, soft inner highlights, gold hairline borders, generous spacing, cinematic dark base.
- Framer Motion for popup, marker entrance, sidebar, 3D transition overlay.

## What is deferred (Phase 2+)

- Three.js overlays: animated water, yachts/boats/cargo/abra with GLTF models, wake trails, clouds, bloom/fog atmosphere.
- Metro system (lines, animated stations, moving train, dim mode).
- Favorites, language switcher, dark/light toggle, analytics dashboard, hero settings, map settings admin.

Called out upfront so expectations match delivery.

## Technical section

**Stack** (already on this template): React 19, TypeScript, Vite 7, TanStack Start, Tailwind v4, shadcn/ui, Framer Motion, TanStack Query, React Hook Form + Zod, Lovable Cloud (Supabase under the hood — replaces Firebase).

**New deps**: `@vis.gl/react-google-maps` (Google Maps wrapper), `mapbox-gl` + `react-map-gl`, `@turf/turf` (bounds helpers), `supercluster` (marker clustering), `framer-motion` (if not already).

**Secrets** (added via `add_secret`, both server + `VITE_` public forms where needed):
- `VITE_GOOGLE_MAPS_API_KEY` — restrict to your domains in Google Cloud console.
- `VITE_MAPBOX_ACCESS_TOKEN` — restrict to your domains in Mapbox account.
- Lovable Cloud auto-provisions `VITE_SUPABASE_*`.

**Data model** (Lovable Cloud migrations)
```text
developers(id, name, slug, logo_url, description, website, created_at)
communities(id, name, slug, description, hero_image_url, center_lat, center_lng)
projects(
  id, slug, name, developer_id, community_id,
  lat, lng, address,
  starting_price_aed, bedrooms_min, bedrooms_max, bathrooms,
  completion_date, payment_plan, status ('ready'|'off_plan'),
  category ('apartment'|'villa'|'townhouse'|'penthouse'|'studio'),
  tags text[] (waterfront, beachfront, golf_view, marina, ...),
  description, main_image_url, video_url, tour_360_url, brochure_url,
  featured bool, created_at, updated_at
)
project_images(id, project_id, url, sort_order)
project_amenities(id, project_id, name, icon)
user_roles(id, user_id, role app_role)  -- per user-roles knowledge
```
All tables: GRANT block, RLS on. Public SELECT (anon) for projects/developers/communities/images/amenities; admin-only INSERT/UPDATE/DELETE via `has_role(auth.uid(),'admin')`. `user_roles` grants only to `authenticated` + `service_role`.

**Server functions** (`src/lib/*.functions.ts`)
- `listProjects({ filters })` — public, server publishable client.
- `getProject(slug)` — public.
- `adminUpsertProject`, `adminDeleteProject`, `adminUpload*` — `requireSupabaseAuth` + role check.

**Routes**
```text
/                       satellite map + sidebar (home)
/projects/$slug         detail
/communities            index
/communities/$slug      filtered map
/developers             index
/developers/$slug       filtered map
/auth                   login/signup (public)
/_authenticated/admin   dashboard shell
  .../projects          list + CRUD
  .../developers
  .../communities
```

**Map switching**
- Both maps mounted; only one visible. State: `mode: 'satellite' | '3d'`.
- On toggle: capture `{ center, zoom }` from active map, animate a full-screen glass overlay (fade + subtle scale), pass camera to the other map, `flyTo` with pitch 60°/bearing 30° on Mapbox side.
- Bounds: `sw: 24.79,54.89`, `ne: 25.41,55.57` (Dubai emirate). Enforced on both maps via `restriction`/`maxBounds`.

**Seed data**: 12–15 realistic sample projects across the named communities so the map is populated before real data arrives.

## Sequence of changes

1. Enable Lovable Cloud → add migrations (tables, RLS, grants, `app_role`, `has_role`, seed) → configure email auth.
2. Add secrets prompt for Google Maps + Mapbox tokens (I'll open the secure form).
3. Install map deps, set root layout + fonts + palette tokens in `src/styles.css`.
4. Build sidebar shell, filters store, project list.
5. Google Maps canvas + custom glass markers + clustering + Liquid Glass popup.
6. Mapbox 3D canvas + transition orchestration + floating 3D toggle.
7. Project detail route + Communities/Developers pages.
8. Auth pages + `_authenticated/admin` CRUD + storage uploads + coordinate picker.
9. Polish pass: motion, empty states, mobile responsiveness, SEO head per route.

## Questions before I start building

- OK to defer Three.js/Metro/favorites/i18n/dark mode to Phase 2 as scoped above?
- I'll use **Lovable Cloud** for DB/auth/storage (not Firebase, per your earlier answer). Confirming.
- Ready to paste your **Google Maps API key** and **Mapbox access token** when I prompt? (Restrict them to your Lovable preview + published domains.)

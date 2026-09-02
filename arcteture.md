# Website Architecture

This document describes the current Dubai Skyview implementation. The requested
filename is kept as `arcteture.md`; use it as the high-level architecture
reference. The feature inventory is in [`futures.md`](futures.md).

## System Overview

Dubai Skyview is a multi-tenant real-estate catalogue with an interactive
Mapbox/Three.js map, Supabase-backed project data, protected administration, and
a dynamic sales-offer PDF flow.

```text
Browser (React 19)
  ├─ TanStack Router / Start routes + SSR
  ├─ TanStack Query + Zustand client state
  ├─ Mapbox GL JS
  │    └─ Three.js custom layers: water, clouds, stations, models
  └─ React PDF renderer: one-page sales offer
          │
          ├─ Supabase Auth + PostgreSQL + Storage + Realtime
          └─ Server functions → Stripe Checkout / Billing Portal
```

TanStack Start and Vite build the client and SSR output through Nitro. The
deployment configuration is in `vercel.json`; secrets stay in server
environment variables.

## Repository Layers

- `src/start.ts`, `src/router.tsx`, and `src/routes/__root.tsx` initialize the
  application, router, SSR boundary, and global layout.
- `src/routes/` contains file-based pages. Public pages include the map,
  project, unit, community, developer, auth, and billing pages. The
  `_authenticated/` route group protects `/admin`, project editing, and the
  platform view.
- `src/components/layout/` contains navigation and sidebar UI;
  `src/components/map/` contains Mapbox lifecycle, markers, popups, POI tools,
  zones, roads, stations, clouds, and water; `src/components/ui/` contains the
  reusable Radix/shadcn primitives.
- `src/hooks/` owns React Query data access (`use-projects`, `use-pois`,
  `use-zones`, `use-auth`, and map configuration). `src/store/` owns persistent
  client state such as filters and tenant selection.
- `src/lib/` contains domain types, Supabase helpers, contact/URL utilities,
  media handling, map geometry, payment calculations, and Stripe server
  functions. `src/pdf/` contains the sales-offer renderer and PDF styles.
- `public/` stores static imagery, cloud sprites, and 3D assets.
  `supabase/migrations/` is the authoritative database history. `scripts/`
  generates and validates OSM/metro/road data.

## Routes and Access

| Route                               | Access                      | Responsibility                                             |
| ----------------------------------- | --------------------------- | ---------------------------------------------------------- |
| `/`                                 | Public                      | Full-screen map, filters, layers, and project popups       |
| `/projects/$slug`                   | Public/published            | Project overview, gallery, amenities, units, and plans     |
| `/projects/$slug/units/$unitTypeId` | Public/published            | Standalone unit detail page with unit media and floor plan |
| `/communities`, `/developers`       | Public                      | Catalogue indexes                                          |
| `/auth`, `/signup`                  | Public                      | Supabase sign-in and account creation                      |
| `/billing` and callback pages       | Authenticated               | Subscription checkout, success, and cancellation states    |
| `/admin`                            | Authenticated/admin         | Project, POI, developer, community, and platform tools     |
| `/admin/projects/$id`               | Authenticated/tenant member | Project editor and sales configuration                     |

Readable project slugs are used in links. Unit IDs remain database UUIDs for
resolution, while the visible unit URL uses readable project/developer/unit
segments.

## Data and Security Architecture

The core graph is `projects → developers, communities, project_images,
project_amenities, project_unit_types`. A unit type can have many
`project_unit_type_images`, with at most one selected as `is_floor_plan`.
Projects can have ordered `project_payment_plans`, ordered
`project_payment_plan_installments`, and optional `project_fees`.

`hospitals`, `schools`, and `tourism` are reference POI tables. `zones` stores
map areas. Tenants, tenant members, user roles, and subscription fields support
multi-tenancy and billing. Every tenant-owned child row carries `tenant_id` and
is checked against its parent by RLS policies and database triggers.

The browser uses the publishable Supabase key. Public reads are limited to
published records; authenticated writes require the correct tenant membership.
Private media is converted to signed URLs at read time and signed URLs are
never persisted. Stripe secret keys and webhook verification remain server-only
inside `src/lib/billing.functions.ts` and Supabase webhook code.

## Map Architecture

`MapContainer` owns view mode, filters, visibility, and map readiness.
`MapboxView` creates the map, applies styles, registers sources/layers after
`style.load`, and mounts heavy custom layers after the map is idle. Satellite
and 3D modes share camera state but load only the modes the user visits.

The map opens on Dubai and allows regional navigation to Ras Al Khaimah through
the bounds in `src/lib/dubai.ts`. The generated sea mesh is built from real OSM
coastlines by `scripts/generate-water-geometry.ts`; `validate:water` and
`verify:earcut` protect its land mask and triangulation. Roads, rail/metro,
landmarks, project plots, zones, and POI markers are separate layers so each
can be toggled or debugged independently.

## Sales Offer Architecture

`UnitOfferDialog.tsx` loads the selected project, unit, media, plans, fees, and
branding. `offer-calculations.ts` validates and calculates amounts;
`pdf-media.ts` prepares browser-safe images; `UnitSalesOfferPdf.tsx` renders the
one-page landscape offer. The selected payment plan is the only source of
installment rows: no Booking, Handover, or other stage is invented. The PDF
opens in a new tab, with a direct-download fallback, and its QR target is
controlled by `VITE_OFFER_QR_URL` or the configured contact URL.

## Development and Release Rules

```bash
npm install
npx vite dev --port 8080
npx tsc --noEmit
npm run lint
npm run validate:water
npm run validate:metro
npm run verify:earcut
npm run build
```

Change database shape through a timestamped migration, regenerate geodata
through its script, and test both map modes plus public/private access before
release. Do not commit `.env`, service-role keys, `.output/`, or local caches.

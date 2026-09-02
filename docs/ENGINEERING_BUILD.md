# Dubai Skyview — Engineering Build Document

## 1. Product Scope

Dubai Skyview is a multi-tenant real-estate discovery platform. Visitors browse Dubai projects on an interactive Mapbox map, filter listings, inspect project and unit details, and request a dynamically generated sales-offer PDF. Administrators manage projects, developers, communities, media, unit types, payment plans, fees, publication status, and map geometry.

## 2. Technology Architecture

- **Web:** React 19, TanStack Start/Router, Vite, Nitro SSR, TanStack Query.
- **Presentation:** Tailwind CSS v4, Radix/shadcn UI, Framer Motion, Lucide icons.
- **Map:** Mapbox GL JS with GeoJSON layers and custom Three.js layers for water, stations, and other 3D elements.
- **Backend:** Supabase PostgreSQL, Auth, Storage, Realtime, and Row Level Security (RLS).
- **Deployment:** Vercel using `vercel.json` and `npm run build`.

## 3. Repository Layout

`src/routes/` contains public and authenticated pages; `src/components/map/` contains map rendering and interaction; `src/components/ui/` contains reusable UI primitives; `src/hooks/` contains Supabase/React Query access; `src/lib/` contains domain utilities and generated Dubai data; `src/pdf/` contains sales-offer rendering; `public/` contains logos, landmark media, clouds, and 3D models; `supabase/migrations/` contains the authoritative schema history; `scripts/` contains geodata generators and audits; `docs/` contains engineering references.

## 4. Main Data Model

Projects relate to developers, communities, gallery images, amenities, unit types, payment plans, and optional fees. Unit types hold label, price, area, floor, and unit-specific images. One unit image may be marked as the floor plan. Payment plans contain ordered installment rows with an exact display label, percentage, due information, and optional month count. All tenant-owned child records carry the parent tenant ID.

## 5. Request and Security Flow

The browser calls Supabase through typed helpers and React Query. SSR loaders fetch public project data and the client query retries with the active session when required. Public reads are limited by `is_public`; authenticated writes are limited by tenant membership and parent ownership. Private project media is resolved to signed URLs at read time; signed URLs must never be persisted.

## 6. Local Build and Release

```bash
npm install
npx vite dev --port 8080
npx tsc --noEmit
npm run lint
npm run build
```

Copy `.env.example` to `.env` and provide Supabase and Mapbox values. Apply reviewed database migrations with `supabase db push`. Before release, verify public/private access, project and unit routes, media, PDF generation, and both map modes. Do not commit `.env`, service-role keys, generated `.output/`, logs, or local caches.

## 7. Maintenance Notes

Generated geodata should be changed through its generator and validation script, not by hand. New map layers must be registered after Mapbox `style.load` and must gate animation work. The unused `src/components/map/CategoryPanel.tsx` was removed after confirming there were no imports; SQL handoff files and scripts remain because they support migration recovery and data validation.

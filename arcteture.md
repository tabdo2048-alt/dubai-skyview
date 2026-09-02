# Dubai Skyview - Repository Architecture

This document is the file-level architecture reference for Dubai Skyview. The
filename `arcteture.md` is retained for compatibility with the project handoff.
All paths below are relative to the repository root. Generated files and local
build output are identified explicitly so they are not edited by hand.

## 1. Product and System Overview

Dubai Skyview is a multi-tenant real-estate catalogue and map application. It
combines a Mapbox GL map, Three.js visual layers, Supabase data and security,
protected administration, Stripe billing, and a dynamic one-page sales-offer
PDF for individual unit types.

```text
Browser
  |
  +-- TanStack Start + Vite + Nitro SSR
  |     |
  |     +-- TanStack Router file routes
  |     +-- React components and Tailwind UI
  |     +-- TanStack Query + Zustand client state
  |     +-- Mapbox GL JS + Three.js custom layers
  |     +-- React PDF renderer + QR code generation
  |
  +-- Supabase Auth / PostgreSQL / RLS / Storage / Realtime
  |     +-- Projects, developers, communities, units, media, POIs, zones
  |     +-- Payment plans, installments, fees, offer branding
  |
  +-- Server-only integrations
        +-- Stripe Checkout and Billing Portal
        +-- Stripe webhook and map-link Edge Functions
```

The main data direction is:

```text
Supabase tables -> hooks -> route/container -> reusable components -> browser
OSM/rail source -> scripts -> generated TypeScript -> Mapbox/Three.js layers
Project + unit + payment plan -> offer calculation -> PDF document -> new tab
```

## 2. Repository Tree

```text
.
|-- src/                         Application source
|-- public/                      Static images, models, and brand assets
|-- supabase/                    Database, RLS, seed data, and Edge Functions
|-- scripts/                     Geodata generation, audits, and verification
|-- docs/                        Engineering and operational documentation
|-- .env.example                 Environment-variable template
|-- README.md                    Product setup and command reference
|-- arcteture.md                 This architecture document
|-- futures.md                   Feature inventory and extension guide
|-- components.json              shadcn/ui component configuration
|-- eslint.config.js             ESLint 9 configuration
|-- package.json                 Scripts and runtime/development dependencies
|-- package-lock.json            Locked npm dependency graph
|-- tsconfig.json                TypeScript compiler configuration
|-- vite.config.ts               Vite/TanStack/Nitro build configuration
|-- vercel.json                  Vercel deployment configuration
`-- skyview-desktop.png          Product reference screenshot
```

Do not commit `.env`, service-role keys, `.output/`, `.wrangler/`, or local
temporary caches. `node_modules/` is dependency output and is not part of the
source architecture.

### File-level source map

The following tree shows the implementation paths that a new contributor will
normally touch. The tables in the later sections explain the responsibility of
each path in more detail.

```text
src/
|-- start.ts
|-- server.ts
|-- router.tsx
|-- routeTree.gen.ts
|-- styles.css
|-- components/
|   |-- ErrorBoundary.tsx
|   |-- layout/
|   |   |-- AppNavbar.tsx
|   |   `-- AppSidebar.tsx
|   |-- offers/
|   |   `-- UnitOfferDialog.tsx
|   |-- map/
|   |   |-- AdminLocationPicker.tsx
|   |   |-- AdminZoneEditor.tsx
|   |   |-- CategoryPanel.tsx
|   |   |-- CloudLayer.tsx
|   |   |-- EmiratesMenu.tsx
|   |   |-- LayersMenu.tsx
|   |   |-- MapContainer.tsx
|   |   |-- MapboxView.tsx
|   |   |-- ProjectPlotEditor.tsx
|   |   |-- ProjectPopup.tsx
|   |   |-- StationModelLayer.ts
|   |   |-- WaterDebugEditor.tsx
|   |   |-- WaterLayer.ts
|   |   |-- landmarksLayer.ts
|   |   |-- poiIcons.ts
|   |   |-- roadsLayer.ts
|   |   |-- stationModel.ts
|   |   `-- waterDebugState.ts
|   `-- ui/
|       |-- accordion.tsx, alert.tsx, alert-dialog.tsx
|       |-- aspect-ratio.tsx, avatar.tsx, badge.tsx
|       |-- breadcrumb.tsx, button.tsx, calendar.tsx
|       |-- card.tsx, carousel.tsx, chart.tsx
|       |-- checkbox.tsx, collapsible.tsx, command.tsx
|       |-- context-menu.tsx, dialog.tsx, drawer.tsx
|       |-- dropdown-menu.tsx, form.tsx, hover-card.tsx
|       |-- input.tsx, input-otp.tsx, label.tsx
|       |-- menubar.tsx, navigation-menu.tsx, pagination.tsx
|       |-- popover.tsx, progress.tsx, radio-group.tsx
|       |-- resizable.tsx, scroll-area.tsx, select.tsx
|       |-- separator.tsx, sheet.tsx, sidebar.tsx
|       |-- skeleton.tsx, slider.tsx, sonner.tsx
|       |-- switch.tsx, table.tsx, tabs.tsx
|       |-- textarea.tsx, toggle.tsx, toggle-group.tsx
|       `-- tooltip.tsx
|-- hooks/
|   |-- use-auth.ts
|   |-- use-map-config.ts
|   |-- use-mobile.tsx
|   |-- use-pois.ts
|   |-- use-projects.ts
|   `-- use-zones.ts
|-- integrations/supabase/
|   |-- auth-attacher.ts
|   |-- auth-middleware.ts
|   |-- client.server.ts
|   |-- client.ts
|   |-- saas.ts
|   `-- types.ts
|-- lib/
|   |-- analytics.ts, billing.functions.ts, config.functions.ts
|   |-- contact.ts, dubai.ts, error-capture.ts, error-page.ts
|   |-- googleMapsLink.ts, image-optimization.ts
|   |-- landmarkLogos.ts, landmarkPhotos.ts, mapDraw.ts, media.ts
|   |-- metro.ts, metroImported.generated.ts, offer-branding.ts
|   |-- offer-calculations.ts, payment-plans.ts, pdf-media.ts
|   |-- projectPlots.ts, roadsMain.generated.ts, shorelines.ts
|   |-- subscription-period.ts, tram.ts, types.ts, unit-types.ts
|   |-- user-security.functions.ts, utils.ts, water.ts, zones.ts
|   `-- mapbox/
|       |-- mercatorLocal.ts
|       |-- performanceConfig.ts
|       |-- sharedThreeRenderer.ts
|       `-- waterWaveModel.ts
|-- pdf/
|   |-- UnitSalesOfferPdf.tsx
|   `-- offer-pdf-styles.ts
|-- routes/
|   |-- __root.tsx, index.tsx, auth.tsx, signup.tsx
|   |-- communities.index.tsx, developers.index.tsx
|   |-- billing.index.tsx, billing.success.tsx, billing.cancel.tsx
|   |-- projects.$slug.tsx
|   |-- projects.$slug.units.$unitTypeId.tsx
|   |-- README.md
|   `-- _authenticated/
|       |-- route.tsx
|       |-- admin.tsx
|       |-- admin_.platform.tsx
|       `-- admin_.projects.$id.tsx
|-- store/
|   |-- filters.ts
|   `-- tenant.ts
`-- types/qrcode.d.ts
```

## 3. Application Entry and Runtime Files

| Path | Responsibility |
| --- | --- |
| `src/start.ts` | TanStack Start client/server entry integration. |
| `src/server.ts` | Server runtime entry used by the SSR/deployment build. |
| `src/router.tsx` | Creates the TanStack Router and registers the generated route tree. |
| `src/routeTree.gen.ts` | Auto-generated route manifest; never edit manually. |
| `src/routes/__root.tsx` | Global document shell, providers, navigation boundary, and `<Outlet />`. |
| `src/styles.css` | Tailwind v4 imports, design tokens, map/PDF-adjacent global styles, and theme utilities. |
| `src/components/ErrorBoundary.tsx` | Catches render failures and presents a recoverable application error state. |

## 4. Routes and Access Boundaries

TanStack Router maps filenames directly to URLs. The `_authenticated` folder is
a pathless protected group, so its name does not appear in the URL.

| File | URL / Access | Responsibility |
| --- | --- | --- |
| `src/routes/index.tsx` | `/`, public | Full-screen map, filters, layers, and project discovery. |
| `src/routes/projects.$slug.tsx` | `/projects/:slug`, public | Project overview, gallery, amenities, unit types, and payment plans. |
| `src/routes/projects.$slug.units.$unitTypeId.tsx` | `/projects/:slug/units/:unitTypeId`, public | Standalone unit detail page with unit media and floor plan. |
| `src/routes/communities.index.tsx` | `/communities`, public | Community catalogue/index. |
| `src/routes/developers.index.tsx` | `/developers`, public | Developer catalogue/index. |
| `src/routes/auth.tsx` | `/auth`, public | Sign-in flow. |
| `src/routes/signup.tsx` | `/signup`, public | Account creation flow. |
| `src/routes/billing.index.tsx` | `/billing`, authenticated | Subscription and billing portal entry. |
| `src/routes/billing.success.tsx` | `/billing/success`, authenticated | Successful Stripe checkout state. |
| `src/routes/billing.cancel.tsx` | `/billing/cancel`, authenticated | Cancelled Stripe checkout state. |
| `src/routes/_authenticated/route.tsx` | route guard | Authenticated layout/middleware boundary. |
| `src/routes/_authenticated/admin.tsx` | `/admin`, admin/member | Administration dashboard and management tools. |
| `src/routes/_authenticated/admin_.projects.$id.tsx` | `/admin/projects/:id`, tenant member | Project editor, unit types, images, plans, fees, and offer branding. |
| `src/routes/_authenticated/admin_.platform.tsx` | `/admin/platform`, platform admin | Platform-level tenant and account administration. |
| `src/routes/README.md` | documentation | File-based routing conventions; not a route. |

Project links use readable project slugs. Unit IDs remain UUIDs because they
are stable database identifiers and are resolved together with the project
slug.

## 5. Components

### Layout and offers

| Path | Responsibility |
| --- | --- |
| `src/components/layout/AppNavbar.tsx` | Global top navigation, account actions, and public/admin links. |
| `src/components/layout/AppSidebar.tsx` | Map filters, catalogue controls, and responsive sidebar shell. |
| `src/components/offers/UnitOfferDialog.tsx` | Loads selected unit/project data, prepares the offer payload, opens PDF output, and exposes download fallback. |

### Map components

| Path | Responsibility |
| --- | --- |
| `src/components/map/MapContainer.tsx` | Map screen orchestration: Satellite/3D mode, camera state, filters, readiness, menus, and active map instance. |
| `src/components/map/MapboxView.tsx` | Creates and owns a Mapbox instance, styles, camera movement, markers, source/layer lifecycle, and deferred heavy layers. |
| `src/components/map/EmiratesMenu.tsx` | Emirate selector that flies to Dubai, Sharjah, or Ras Al Khaimah. |
| `src/components/map/LayersMenu.tsx` | Transit, roads, investment-zone, and development water-editor toggles. |
| `src/components/map/CategoryPanel.tsx` | Category/POI browsing controls. |
| `src/components/map/ProjectPopup.tsx` | Project marker popup and project navigation actions. |
| `src/components/map/ProjectPlotEditor.tsx` | Admin drawing/editing of project plot geometry and color. |
| `src/components/map/AdminLocationPicker.tsx` | Admin map picker for project coordinates. |
| `src/components/map/AdminZoneEditor.tsx` | Admin editor for investment-zone polygons. |
| `src/components/map/CloudLayer.tsx` | Animated cloud sprite layer over the map. |
| `src/components/map/WaterLayer.ts` | Three.js animated water surface, coastline mask, waves, foam, and marine visuals. |
| `src/components/map/WaterDebugEditor.tsx` | Development-only controls for inspecting water coverage and styling. |
| `src/components/map/waterDebugState.ts` | Local state/gating for the water debug editor. |
| `src/components/map/StationModelLayer.ts` | Three.js glTF metro-station model rendering and lifecycle cleanup. |
| `src/components/map/stationModel.ts` | Station model asset/material and placement helpers. |
| `src/components/map/landmarksLayer.ts` | Map landmark markers, popups, and interactions. |
| `src/components/map/poiIcons.ts` | POI icon definitions and marker presentation. |
| `src/components/map/roadsLayer.ts` | Animated/custom road source and layer registration. |

### Reusable UI primitives

`src/components/ui/` contains shadcn/Radix-style wrappers. They centralize
accessible behavior, variants, and Tailwind styling so product components do
not duplicate dialog, form, menu, table, or input logic.

```text
accordion.tsx       alert.tsx              alert-dialog.tsx
aspect-ratio.tsx    avatar.tsx             badge.tsx
breadcrumb.tsx      button.tsx             calendar.tsx
card.tsx            carousel.tsx           chart.tsx
checkbox.tsx        collapsible.tsx        command.tsx
context-menu.tsx    dialog.tsx             drawer.tsx
dropdown-menu.tsx   form.tsx               hover-card.tsx
input.tsx           input-otp.tsx          label.tsx
menubar.tsx         navigation-menu.tsx    pagination.tsx
popover.tsx         progress.tsx           radio-group.tsx
resizable.tsx       scroll-area.tsx        select.tsx
separator.tsx       sheet.tsx              sidebar.tsx
skeleton.tsx        slider.tsx             sonner.tsx
switch.tsx          table.tsx              tabs.tsx
textarea.tsx        toggle.tsx             toggle-group.tsx
tooltip.tsx
```

## 6. Data Hooks, State, and Integrations

| Path | Responsibility |
| --- | --- |
| `src/hooks/use-projects.ts` | Project queries, relations, legacy-schema compatibility, filtering, and realtime refresh. |
| `src/hooks/use-pois.ts` | Hospital, school, tourism, and other point-of-interest queries/realtime state. |
| `src/hooks/use-zones.ts` | Investment-zone queries and realtime updates. |
| `src/hooks/use-auth.ts` | React-facing Supabase session, user, and sign-out state. |
| `src/hooks/use-map-config.ts` | Loads map configuration and Mapbox access settings. |
| `src/hooks/use-mobile.tsx` | Responsive breakpoint helper. |
| `src/store/filters.ts` | Zustand store for map mode, layer toggles, categories, and filters. |
| `src/store/tenant.ts` | Active tenant/org selection state. |
| `src/integrations/supabase/client.ts` | Browser Supabase client using publishable credentials. |
| `src/integrations/supabase/client.server.ts` | Server-side Supabase client and request context. |
| `src/integrations/supabase/auth-middleware.ts` | Auth/session middleware and route protection support. |
| `src/integrations/supabase/auth-attacher.ts` | Attaches auth state to the application runtime. |
| `src/integrations/supabase/saas.ts` | Tenant membership, roles, subscription access, and SaaS authorization helpers. |
| `src/integrations/supabase/types.ts` | Generated/central Supabase database type definitions. |

The browser may use only the publishable Supabase key. Service-role and Stripe
secrets remain server-side or inside Supabase Edge Functions.

## 7. Domain Libraries

| Path | Responsibility |
| --- | --- |
| `src/lib/types.ts` | Shared application/domain TypeScript types. |
| `src/lib/utils.ts` | General class-name and utility helpers. |
| `src/lib/dubai.ts` | Dubai opening bounds, regional bounds, emirate camera targets, categories, statuses, and formatting helpers. |
| `src/lib/metro.ts` | Metro/train line models, station data, and transit geometry. |
| `src/lib/tram.ts` | Tram route data and helpers. |
| `src/lib/metroImported.generated.ts` | Generated imported rail/metro geometry; do not edit manually. |
| `src/lib/coastline.generated.ts` | Generated OSM coastline geometry for the water mask. |
| `src/lib/roadsMain.generated.ts` | Generated main-road geometry used by the animated road layer. |
| `src/lib/shorelines.ts` | Shoreline and marine boundary helpers. |
| `src/lib/water.ts` | Water feature configuration and geometry metadata. |
| `src/lib/projectPlots.ts` | Project plot geometry helpers. |
| `src/lib/zones.ts` | Investment-zone categories, colors, ordering, and labels. |
| `src/lib/googleMapsLink.ts` | Safe Google Maps URL generation/resolution. |
| `src/lib/contact.ts` | Contact/WhatsApp URL and display helpers. |
| `src/lib/media.ts` | Media URL normalization and public/private image handling. |
| `src/lib/image-optimization.ts` | Browser image sizing and optimization helpers. |
| `src/lib/landmarkLogos.ts` | Landmark logo asset mapping. |
| `src/lib/landmarkPhotos.ts` | Landmark photo asset mapping. |
| `src/lib/mapDraw.ts` | Shared map drawing utilities and plot editing support. |
| `src/lib/mapbox/mercatorLocal.ts` | Local coordinate conversion for Three.js map layers. |
| `src/lib/mapbox/performanceConfig.ts` | Map/renderer performance and quality settings. |
| `src/lib/mapbox/sharedThreeRenderer.ts` | Shared Three.js renderer lifecycle for Mapbox custom layers. |
| `src/lib/mapbox/waterWaveModel.ts` | Water wave mesh/material animation model. |
| `src/lib/payment-plans.ts` | Payment-plan data normalization and installment helpers. |
| `src/lib/offer-calculations.ts` | Offer totals, installment amounts, fees, percentages, and financial summaries. |
| `src/lib/offer-branding.ts` | Project-level offer colors, labels, logo/contact configuration. |
| `src/lib/pdf-media.ts` | Converts remote/browser images into PDF-safe data for React PDF. |
| `src/lib/unit-types.ts` | Unit-type normalization and display helpers. |
| `src/lib/subscription-period.ts` | Subscription period and expiry calculations. |
| `src/lib/billing.functions.ts` | Server functions for Stripe Checkout and Billing Portal. |
| `src/lib/config.functions.ts` | Server configuration access. |
| `src/lib/user-security.functions.ts` | Server-side user/security operations. |
| `src/lib/analytics.ts` | Analytics event helpers. |
| `src/lib/error-capture.ts` | Error reporting/capture integration. |
| `src/lib/error-page.ts` | Shared error-page model and presentation data. |
| `src/types/qrcode.d.ts` | Type declaration for the QR-code package. |

## 8. PDF Sales Offer Architecture

```text
UnitOfferDialog.tsx
  -> fetch selected project, unit type, media, plan, fees, branding
  -> payment-plans.ts and offer-calculations.ts
  -> pdf-media.ts converts images for browser PDF rendering
  -> UnitSalesOfferPdf.tsx + offer-pdf-styles.ts
  -> Blob URL opened in a new browser tab
  -> direct download remains available as fallback
```

| Path | Responsibility |
| --- | --- |
| `src/pdf/UnitSalesOfferPdf.tsx` | React PDF document: header, project image, unit details, payment table/timeline, financial summary, floor-plan image, QR code, and footer. |
| `src/pdf/offer-pdf-styles.ts` | Landscape one-page PDF layout, colors, typography, spacing, cards, tables, and responsive content rules. |
| `src/components/offers/UnitOfferDialog.tsx` | Offer action UI and browser-side PDF generation/open/download flow. |
| `src/lib/offer-calculations.ts` | Pure calculations used by both the preview logic and PDF. |
| `src/lib/pdf-media.ts` | Image loading, data-URL conversion, and safe fallback behavior. |
| `src/lib/offer-branding.ts` | Dynamic project branding and configurable QR/contact target. |

The selected payment plan is the only source of payment stages. The renderer
iterates the actual installment rows and never invents Booking, Handover,
Construction, or Post-Handover stages. Missing optional images/fees remain
missing; they are not silently replaced with unrelated project data.

## 9. Map Rendering and Geodata Pipeline

`MapContainer` owns the application-level map state. `MapboxView` owns one
Mapbox instance per visited mode. Satellite and 3D views share the current
camera but are mounted lazily to reduce GPU/memory cost. Expensive Three.js
layers are attached after Mapbox style/idle events.

```text
scripts/*.ts / *.mjs
  -> OpenStreetMap, rail, and review data
  -> generated files under src/lib/
  -> Mapbox sources/layers and Three.js custom layers
  -> validation scripts protect geometry integrity
```

| Generated/runtime path | Rule |
| --- | --- |
| `src/lib/coastline.generated.ts` | Regenerate from water script; do not hand-edit coordinates. |
| `src/lib/roadsMain.generated.ts` | Regenerate from road script; custom overlay is separate from Mapbox basemap. |
| `src/lib/metroImported.generated.ts` | Regenerate when imported transit geometry changes. |
| `scripts/.cache/` | Local source/cache responses; not application source. |
| `public/models/metro-station.glb` | Static glTF model used by `StationModelLayer`. |

Regional camera targets are defined in `src/lib/dubai.ts`: Dubai is the default
opening frame, while Sharjah and Ras Al Khaimah are explicit named targets.
The emirate selector in `src/components/map/EmiratesMenu.tsx` sends the active
target to `MapboxView` in both Satellite and 3D modes.

## 10. Static Assets

| Path | Contents |
| --- | --- |
| `public/brand/keyora-logo.png` | Primary brand logo. |
| `public/brand/keyora-logo-180.png` | Large logo variant. |
| `public/brand/keyora-logo-32.png` | Small/favicon-sized logo variant. |
| `public/project-logo.svg` | Project/application logo asset. |
| `public/cloud1.webp` through `public/cloud4.webp` | Cloud sprites for `CloudLayer`. |
| `public/landmarks/` | `ain-dubai.png`, `atlantis-palm.png`, `burj-al-arab.png`, `burj-khalifa.png`, `dubai-frame.jpg`, `dubai-mall.png`, `dubai-marina.png`, `dubai-opera.png`, `global-village.png`, `img-worlds.png`, `la-mer.png`, `miracle-garden.png`, `museum-of-future.png`, `ski-dubai.png`, and `wild-wadi.png`. |
| `public/models/README.md` | Model asset notes. |
| `public/models/metro-station.glb` | Station model for the 3D map layer. |

Project and unit images are normally stored in Supabase Storage/database URLs,
not committed to `public/`.

## 11. Scripts and Verification

| Path | Responsibility |
| --- | --- |
| `scripts/generate-water-geometry.ts` | Downloads/normalizes coastline and generates the water mask. |
| `scripts/generate-roads.ts` | Generates the main-road network. |
| `scripts/generate-rail.ts` | Generates rail/metro geometry. |
| `scripts/generate-hospitals.ts` | Builds hospital reference data. |
| `scripts/generate-schools.ts` | Builds school reference data. |
| `scripts/earcut-check.ts` | Verifies water polygon triangulation. |
| `scripts/auditWaterOverlap.ts` | Checks water coverage and land-mask overlap. |
| `scripts/validateMetro.ts` | Validates rail lines, stations, and route integrity. |
| `scripts/auditRoadsCompleteness.mjs` | Audits road dataset coverage. |
| `scripts/auditRoadColors.mjs` | Audits generated road color/style data. |
| `scripts/diagnoseRoads.mjs` | Diagnostics for road data and rendering. |
| `scripts/optimizeRoadColors.mjs` | Applies road color optimization. |
| `scripts/probe-net.mjs` | Network/source probing utility. |
| `scripts/screenshot-water.ts` | Playwright water-layer verification screenshot. |
| `scripts/verify-headed.mjs` | Headed browser verification helper. |
| `scripts/verify-shots.mjs` | Screenshot verification helper. |
| `scripts/verify-train.mjs` | Train/rail visual verification helper. |
| `scripts/build-metro.mjs` | Metro data build helper. |
| `scripts/build-brand-logo.mjs` | Brand asset generation helper. |
| `scripts/_de.mjs` | Local script/development utility. |
| `scripts/hospitals.review.json` | Review input/output for hospital data. |
| `scripts/schools.review.json` | Review input/output for school data. |

Important commands:

```bash
npm run dev
npx tsc --noEmit
npm run lint
npm run validate:water
npm run validate:metro
npm run verify:earcut
npm run build
```

## 12. Supabase Architecture

### Configuration, seeds, and functions

| Path | Responsibility |
| --- | --- |
| `supabase/config.toml` | Local Supabase CLI configuration. |
| `supabase/APPLY_THIS.sql` | Manual database repair/apply script; review before execution. |
| `supabase/APPLY_THIS_3.sql` | Manual follow-up migration/apply script. |
| `supabase/APPLY_THIS_4.sql` | Manual follow-up migration/apply script. |
| `supabase/APPLY_THIS_5.sql` | Manual follow-up migration/apply script. |
| `supabase/APPLY_THIS_6.sql` | Manual follow-up migration/apply script. |
| `supabase/APPLY_THIS_7.sql` | Manual follow-up migration/apply script. |
| `supabase/seed_dubai_sample_projects.sql` | Optional sample project/developer/community data. |
| `supabase/seed_dubai_pois.sql` | Optional point-of-interest seed data. |
| `supabase/seed_dubai_hospitals.sql` | Optional hospital seed data. |
| `supabase/seed_dubai_schools.sql` | Optional school seed data. |
| `supabase/seed_dubai_tourism.sql` | Optional tourism seed data. |
| `supabase/functions/resolve-maps-link/index.ts` | Server-side map-link resolution function. |
| `supabase/functions/stripe-webhook/index.ts` | Stripe webhook verification and subscription updates. |

### Migration history

`supabase/migrations/` is append-only database history. Apply schema changes by
adding a new timestamped migration rather than editing an already-applied file.

| Migration | Scope |
| --- | --- |
| `20260707195923_ca4deb94-431d-404a-b288-e8d52431aee9.sql` | Initial project schema foundation. |
| `20260707195936_64863447-30b5-46b9-b429-5c8d836bf465.sql` | Initial related catalogue schema. |
| `20260707200009_ba0c2cbd-b6d3-4046-875e-388415445e2d.sql` | Initial supporting database objects. |
| `20260710120000_create_project_media_bucket.sql` | Project media storage bucket. |
| `20260721000000_project_media_storage_policies.sql` | Storage access policies. |
| `20260722120000_create_poi_tables.sql` | Hospital, school, tourism, and POI tables. |
| `20260722130000_create_zones_table.sql` | Investment-zone table. |
| `20260724000000_rename_zone_category_str_to_flip.sql` | Zone category naming correction. |
| `20260805120000_add_project_plot_geometry.sql` | Project polygon/plot geometry. |
| `20260805130000_add_project_plot_color.sql` | Project plot display color. |
| `20260812000000_multitenant_foundation.sql` | Tenants, roles, memberships, and ownership foundation. |
| `20260812010000_saas_onboarding.sql` | SaaS onboarding and organization setup. |
| `20260812020000_project_media_tenant_policies.sql` | Tenant-aware project media policies. |
| `20260812030000_stripe_webhook_hardening.sql` | Webhook security and idempotency hardening. |
| `20260812040000_security_hardening.sql` | General RLS and database security hardening. |
| `20260812050000_least_privilege_grants.sql` | Least-privilege database grants. |
| `20260812060000_billing_hardening_and_public_showcase.sql` | Billing rules and public showcase access. |
| `20260812070000_login_rate_allowlist.sql` | Login-rate allowlist controls. |
| `20260812080000_platform_admins_cannot_suspend_each_other.sql` | Platform-admin suspension protection. |
| `20260812090000_storage_no_anonymous_enumeration.sql` | Prevents anonymous storage enumeration. |
| `20260812100000_tenant_members_manage_projects.sql` | Tenant-member project management permissions. |
| `20260812110000_security_integrity_hardening.sql` | Ownership and integrity constraints. |
| `20260812120000_private_project_media.sql` | Private project-media access model. |
| `20260812130000_login_rate_drift_repair.sql` | Login-rate consistency repair. |
| `20260812140000_public_media_read_consistency.sql` | Public media read-policy consistency. |
| `20260812150000_platform_only_publication.sql` | Platform-controlled project publication. |
| `20260813100000_ashraf_suspend_admin_override.sql` | Named admin suspension override rule. |
| `20260813110000_user_account_blocks.sql` | User account block state. |
| `20260813120000_image_loading_indexes.sql` | Image query/index performance. |
| `20260817000000_login_rate_5_per_5_minutes.sql` | Login rate limit of five attempts per five minutes. |
| `20260817001000_platform_users_subscription_period.sql` | Subscription period fields. |
| `20260817002000_default_org_unlimited.sql` | Default organization subscription behavior. |
| `20260817100000_project_unit_types.sql` | Unit types and project-level unit configuration. |
| `20260818000000_unit_area_square_meters.sql` | Square-meter area support. |
| `20260818001000_expire_subscription_on_period_end.sql` | Subscription expiry behavior. |
| `20260821000000_project_payment_plans.sql` | Payment-plan records. |
| `20260828100000_dynamic_sales_offer.sql` | Dynamic installments and optional project fees for sales offers. |
| `20260829100000_unit_type_floor_plan.sql` | Optional unit-type floor-plan URL. |
| `20260830100000_project_offer_branding.sql` | Project-specific PDF branding/accent configuration. |
| `20260831100000_unit_type_images.sql` | Multiple unit images and one selected floor-plan image. |
| `20260901000000_project_unit_type_floor.sql` | Unit floor metadata. |

Every tenant-owned child table must retain tenant ownership checks, parent
integrity validation, and RLS policies. Public reads must expose only records
intended for the public showcase.

## 13. Authentication, Billing, and Security Flow

```text
Request -> auth middleware -> Supabase session -> route guard
        -> tenant/role check -> query protected by RLS

Authenticated user -> billing route -> server billing function
                   -> Stripe Checkout/Portal
                   -> verified Stripe webhook -> subscription state in Supabase
```

`src/integrations/supabase/auth-middleware.ts` protects authenticated route
groups. `src/integrations/supabase/saas.ts` handles tenant and subscription
authorization. `src/lib/billing.functions.ts` keeps Stripe secret operations on
the server. `supabase/functions/stripe-webhook/index.ts` verifies webhook
signatures before changing billing state.

Never move service-role, Stripe secret, webhook, or private Mapbox credentials
into client-side `VITE_` variables. Signed media URLs are generated at read
time and must never be persisted back into database rows.

## 14. Documentation and Handoff Files

| Path | Responsibility |
| --- | --- |
| `README.md` | Product summary, setup, environment variables, scripts, and deployment. |
| `futures.md` | Feature inventory covering the map, authentication, admin, catalogue, units, billing, and sales offers. |
| `arcteture.md` | Detailed architecture, ownership boundaries, file map, data flow, and release checklist. |
| `docs/ENGINEERING_BUILD.md` | Engineering build, security, data model, and deployment notes. |
| `docs/SALES_OFFER_PDF_ENGINEERING_BUILD.md` | PDF data contract, dynamic installment rules, image handling, and QA. |
| `docs/geodata.md` | Geodata generation and validation workflow. |
| `docs/map-performance.md` | Map loading, code splitting, GPU, and rendering performance guidance. |
| `docs/water-layer.md` | Animated water implementation and styling notes. |
| `src/routes/README.md` | TanStack file-based route naming and URL conventions. |

## 15. Build and Release Architecture

```text
Vite client build + TanStack route splitting
  + Nitro SSR build
  + Cloudflare/Vercel-compatible output
  -> .output/
```

`vite.config.ts` wires React, Tailwind, TypeScript paths, TanStack Router, and
Nitro. `package.json` is the authoritative command/dependency contract.
Production validation should include:

```bash
npm install
npx tsc --noEmit
npm run lint
npm run validate:water
npm run validate:metro
npm run verify:earcut
npm run build
```

Before release, manually verify the public map, Satellite and 3D modes,
regional emirate navigation, project and unit URLs, authenticated admin pages,
RLS behavior, Stripe callbacks, and PDF generation with both complete and
optional/missing data. The repository is deployable through the Vercel setup in
`vercel.json`; environment values must be configured in the deployment secret
store rather than committed to source control.

# Feature Inventory

This file records the implemented product features and their main code paths.
The filename is retained as requested; it is an inventory and extension guide,
not a list of unimplemented promises.

## 1. Interactive Map

- Mapbox GL JS provides the base map, satellite view, Standard 3D style,
  camera controls, pitch/bearing, fly-in, zoom-dependent detail, and project
  marker rendering.
- The map opens on Dubai and now supports regional panning and zooming toward
  Ras Al Khaimah. Bounds are centralized in `src/lib/dubai.ts`.
- Projects can be filtered by search, category, status, community, tags, price,
  and bedrooms. Markers can be revealed individually and opened in a rich
  `ProjectPopup`.
- Map layers include project plots, community zones, landmarks, POIs, custom
  roads, metro/rail lines, station models, clouds, and animated water.

## 2. Animated Water and Atmosphere

- `WaterLayer.ts` renders animated Three.js Gerstner-wave surfaces in the map's
  supported modes. `waterWaveModel.ts` is shared by GPU animation and vessel
  physics.
- OSM coastline, islands, marina, creek, canal, and Palm lagoon geometry is
  generated into `src/lib/coastline.generated.ts` by
  `scripts/generate-water-geometry.ts`.
- The water generator closes land against a padded regional coverage rectangle,
  preserves real islands, and validates sea/land probes. Run
  `npm run generate:water` and `npm run validate:water` after geometry changes.
- `CloudLayer.tsx` adds the atmospheric cloud/sprite layer. Rendering is gated
  by map readiness, active mode, and visibility to limit GPU work.

## 3. Metro, Train, and Roads

- Metro and train line data is generated or maintained in `src/lib/metro.ts`,
  `src/lib/tram.ts`, and generated network files. `StationModelLayer.ts` draws
  procedural 3D stations with line colors and interchange variants.
- `roadsLayer.ts` and `roadsMain.generated.ts` provide animated road reveal,
  route highlighting, road labels, and the Dubai Roads Guide. The Mapbox base
  style supplies regional roads beyond the optional custom overlay.
- Dedicated commands validate metro integrity and triangulate all water shapes:
  `npm run validate:metro` and `npm run verify:earcut`.

## 4. Places of Interest

The category panel controls live POI queries for:

- Hospitals, with medical marker styling.
- Schools, with education marker styling.
- Tourism, with attraction marker styling.

The admin page can add, list, and delete POIs using the matching Supabase table.
POI changes are refreshed through Supabase Realtime. The same admin flow also
manages project locations, developers, communities, and map zones.

## 5. Projects and Units

- Public project browsing supports project cards, readable project links,
  community/developer indexes, image galleries, amenities, videos, 360 tours,
  brochures, status, tags, location, and price information.
- Each project can contain independent unit types such as studio, 1BR, or 2BR.
  Unit fields include label, price, area, floor, bedrooms, bathrooms, and
  completion-related information.
- Every unit type has its own detail route and media set. A normal unit image is
  used as the main unit image; a separately selected unit image can be marked as
  the floor plan. Project images are not silently copied into a unit slot.
- The admin editor uploads multiple unit images, selects the floor-plan image,
  edits unit data, and keeps project media separate from unit media.

## 6. Authentication, Accounts, and Tenants

- Supabase Auth supports sign-in, sign-up, session restoration, sign-out, and
  auth-state subscriptions through `use-auth.ts`.
- Authenticated route protection is handled by the `_authenticated` route group.
  User roles and tenant membership determine whether an account can manage
  projects, administer POIs, or use platform tools.
- RLS policies enforce tenant ownership in PostgreSQL. Public project pages can
  read only published content; tenant members can write only their own records.

## 7. Admin and Platform Management

The admin interface covers:

- Project create/edit/delete, publication, featured state, map coordinates,
  plot geometry/color, developer, community, status, tags, and descriptions.
- Project main image, gallery, offer-header image, branding colors, video,
  virtual tour, brochure, and contact-facing data.
- Developers, communities, map zones, and POI records for tourism, schools,
  and hospitals.
- Unit types, multiple unit photos, floor-plan selection, unit floor, and unit
  pricing/area data.
- Payment plans, ordered installments, default plan selection, optional fixed or
  percentage fees, and legacy-plan compatibility.
- Platform-level tenant and account controls where the current role allows it.

## 8. Payment Plans and Sales-Offer PDF

- An admin defines one or more named plans and their ordered installment rows.
  Each row stores an exact display label, percentage, due type/label, sort order,
  and optional months.
- The offer calculator validates that the chosen plan totals 100%, calculates
  each amount from unit price, calculates monthly amounts only when `months`
  exists, and adds only explicitly configured fees.
- The PDF is a compact one-page landscape real-estate offer with project header,
  unit details, dynamic payment cards/table/timeline/distribution, financial
  summary, unit image, selected floor plan, branding, contact block, and QR.
- The selected plan is the sole payment source of truth. Empty or invalid plans
  block generation; hardcoded Booking, Down Payment, Construction, Handover,
  and Post-Handover stages never appear unless saved as actual labels.
- The PDF opens in a new browser tab. The browser viewer provides download, and
  a popup-block fallback downloads the generated file. QR destination is
  configured by `VITE_OFFER_QR_URL`, with the contact URL as fallback.

## 9. Subscription Billing

- `/billing` offers monthly/yearly tenant subscriptions through server-owned
  Stripe prices.
- Checkout creates or reuses a tenant Stripe customer and validates configured
  price IDs, currency, amount, and interval server-side.
- Billing Portal handles payment-method changes and cancellation. Webhooks
  update tenant subscription state; inactive, expired, or failed states do not
  permanently lock an organization out of a new checkout.
- Stripe secrets, webhook secrets, and canonical redirect URLs are server-only.

## 10. Media, Reliability, and Operations

- Supabase Storage holds project and unit media. URLs are signed at read time;
  WebP/AVIF files are converted when React PDF needs a compatible data URI.
- Legacy project columns and missing optional migrations have narrow fallbacks so
  old projects remain readable without inventing payment or media data.
- React Query caches server state and Realtime invalidates POI/project-related
  data where configured. Error boundaries and error capture keep a failed map
  layer or PDF generation from crashing the whole application.
- Before release run `npx tsc --noEmit`, `npm run lint`, geodata validators, and
  `npm run build`; manually verify public routes, admin writes, both map modes,
  unit images, and PDFs with missing optional data.

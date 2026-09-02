# Sales Offer PDF — Engineering Build Document

## 1. Feature Objective

Generate a one-page, landscape A4 real-estate sales offer from the selected project, unit type, payment plan, media, branding, and contact configuration. The PDF is opened in a new browser tab; the browser PDF viewer still provides its normal download action. If a popup is blocked, the implementation falls back to a direct download.

## 2. Component Flow

`UnitOfferDialog.tsx` loads the complete project graph, lets the user select a priced unit and saved payment plan, validates the plan, creates the QR image, prepares media, and invokes `pdf(<UnitSalesOfferPdf />)`. `UnitSalesOfferPdf.tsx` renders the one-page layout. `offer-pdf-styles.ts` owns the visual system. `offer-calculations.ts` is the only calculation layer. `pdf-media.ts` selects the correct project/unit images and converts unsupported browser image formats before PDF rendering.

## 3. Database Contract

- `project_payment_plans`: ordered named plans, with one optional default.
- `project_payment_plan_installments`: the plan’s ordered source rows: `label`, `percentage`, `due_type`, `due_label`, and `months`.
- `project_unit_types`: unit label, price, area, floor, and legacy `floor_plan_url`.
- `project_unit_type_images`: multiple unit photos, with at most one `is_floor_plan = true`.
- `project_fees`: optional percentage or fixed fees used only when present.
- `projects`: project image, optional offer header image, primary/accent colors, developer, community, and public URL data.

## 4. Non-Negotiable Dynamic Rules

The selected payment plan is the sole source of payment stages. Every PDF card, table row, timeline item, distribution segment, percentage, amount, and total is mapped from `calculation.installments`. No Booking, Down Payment, Construction, Handover, Post Handover, or other fallback stage is created or renamed. The generator requires at least one saved installment and a total of exactly 100%; otherwise generation is blocked. Installment amounts are `unit price × percentage / 100` and monthly values use the saved `months` field.

## 5. Image and Header Rules

The header uses the configured project offer image, then the project main image/gallery fallback. It is composed of a real opaque navy text panel (one third) and the project image (two thirds); header copy is fully opaque white/gold. Unit pages and PDF floor-plan sections use only unit images. A normal unit photo is preferred for the unit image; the selected floor plan is rendered separately below. If no normal unit photo exists, no project image is copied into the unit slot. If no image exists, the relevant image area is omitted or shows the explicit empty state.

Uploaded WebP/AVIF media is optimized in the admin flow and converted to a JPEG data URI when needed by React PDF. Stored URLs remain canonical, while signed render URLs are added at read time.

## 6. Sharing and QR

Project links use the readable project-name segment (`/projects/project-name`) for compatibility with old links. Unit links use the project name, developer, and unit label, while UUID unit IDs remain accepted by the detail resolver. The PDF QR target is controlled by `VITE_OFFER_QR_URL`; when empty, it falls back to the configured WhatsApp contact URL.

## 7. Acceptance Checklist

- Select plans with 1, 3, and many installments; confirm exact row parity and no invented stages.
- Test a missing optional fee, image, floor plan, bedroom, and bathroom.
- Confirm project image appears only in the header and unit media stays unit-specific.
- Confirm the PDF is one page, text is opaque, QR opens the configured target, and download remains available.
- Test direct project links, unit links, anonymous published access, and authenticated unpublished access.
- Run `npx tsc --noEmit`, `npm run lint`, and `npm run build` before release.

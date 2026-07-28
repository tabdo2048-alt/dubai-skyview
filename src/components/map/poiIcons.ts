// Per-category fallback glyphs for landmark markers, as inline SVG strings.
//
// A POI with no logo/photo must still render a clean, recognisable icon — never
// a broken-image box. These are the same lucide icons the CategoryPanel toggle
// uses (Palmtree / GraduationCap / Hospital), hand-inlined so a marker can drop
// one in without pulling React into the imperative Mapbox marker code.
//
// The SVG strings are compile-time constants and contain NO user data, so
// assigning them via innerHTML is safe; the place name always stays on
// textContent. `stroke="currentColor"` lets the marker's category colour tint
// the glyph.
import type { PoiCategory } from "@/hooks/use-pois";

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">${paths}</svg>`;

const ICONS: Record<PoiCategory, string> = {
  // Camera — a clean, universally-read "sightseeing / tourism" mark that stays
  // legible at ~17px (the old palm glyph was too busy at marker size).
  tourism: svg(
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  ),
  schools: svg(
    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  ),
  hospitals: svg(
    '<path d="M12 6v4"/><path d="M14 14h-4"/><path d="M14 18h-4"/><path d="M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/>',
  ),
};

/** Build a fallback glyph element for a category (used when a POI has no logo). */
export function fallbackIcon(category: PoiCategory): HTMLElement {
  const span = document.createElement("span");
  span.className = "poi-lm-fallback";
  span.innerHTML = ICONS[category] ?? ICONS.tourism;
  return span;
}

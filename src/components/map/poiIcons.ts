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
  tourism: svg(
    '<path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/>',
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

// Line-art (lucide) glyphs for landmark chips, plus a resolver that picks a
// distinct glyph per place type — not one generic icon per category.
//
// Resolution order (see iconFor): an explicit `icon` field on the row → a curated
// per-name glyph (notable places) → the per-category default. All glyph strings
// are compile-time constants with NO user data, so assigning them via innerHTML
// is safe. `stroke="currentColor"` lets the chip control the stroke colour.
import type { PoiCategory } from "@/hooks/use-pois";

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

// Named glyphs. Keep each recognisable at ~20px.
const GLYPHS: Record<string, string> = {
  // tourism family
  landmark: svg(
    '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  ),
  tower: svg(
    '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  ),
  palm: svg(
    '<path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/>',
  ),
  waves: svg(
    '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  ),
  shopping: svg(
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  ),
  ferris: svg(
    '<circle cx="12" cy="12" r="2"/><path d="M12 2v4"/><path d="m6.8 15-3.5 2"/><path d="m20.7 7-3.5 2"/><path d="M6.8 9 3.3 7"/><path d="m20.7 17-3.5-2"/><path d="m9 22 3-8 3 8"/><path d="M8 22h8"/><path d="M18 18.7a9 9 0 1 0-12 0"/>',
  ),
  fish: svg(
    '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/><path d="M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4"/><path d="M16.01 17.93l.23 1.4A2 2 0 0 1 14.26 21H8.46c1.15-1.22 2.18-2.94 2.44-4.66"/>',
  ),
  trees: svg(
    '<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>',
  ),
  // education family
  gradcap: svg(
    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  ),
  university: svg(
    '<path d="M14 22v-4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17"/><path d="m4 6 8-4 8 4"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/>',
  ),
  // hospital family
  cross: svg(
    '<path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2z"/>',
  ),
  hospital: svg(
    '<path d="M12 6v4"/><path d="M14 14h-4"/><path d="M14 18h-4"/><path d="M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/>',
  ),
  stethoscope: svg(
    '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
  ),
  pill: svg(
    '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  ),
  clinic: svg(
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 7h4"/><path d="M12 5v4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  ),
};

const CATEGORY_DEFAULT: Record<PoiCategory, string> = {
  tourism: "landmark",
  schools: "gradcap",
  hospitals: "cross",
};

// Curated distinct glyph for notable places, keyed by exact DB `name`. Everything
// not listed falls back to the per-category default.
const BY_NAME: Record<string, string> = {
  "Burj Khalifa": "tower",
  "Museum of the Future": "tower",
  "The Dubai Mall": "shopping",
  "Dubai Marina": "waves",
  "The Dubai Fountain": "waves",
  "Dubai Creek": "waves",
  "Palm Jumeirah": "palm",
  "Atlantis The Palm": "palm",
  "La Mer": "palm",
  "JBR Beach": "palm",
  "Jumeirah Beach": "palm",
  "Wild Wadi Waterpark": "waves",
  "Aquaventure Waterpark": "waves",
  "Ain Dubai": "ferris",
  "Global Village": "ferris",
  "IMG Worlds of Adventure": "ferris",
  "Dubai Aquarium & Underwater Zoo": "fish",
  "Dubai Aquarium": "fish",
  "The Lost Chambers Aquarium": "fish",
  "Dubai Miracle Garden": "trees",
  "Dubai Garden Glow": "trees",
  "Zabeel Park": "trees",
  "Safa Park": "trees",
  "Mushrif Park": "trees",
  "Jumeirah Mosque": "landmark",
  "Burj Al Arab": "tower",
  "Dubai Frame": "landmark",
  "Dubai Opera": "landmark",
  "American University in Dubai": "university",
  "Heriot-Watt University Dubai": "university",
  "University of Wollongong in Dubai": "university",
  "American Hospital": "hospital",
  "Mediclinic City Hospital": "hospital",
  "Aster Clinic": "clinic",
  "Aster Pharmacy": "pill",
};

/** Resolve the line-art glyph (SVG string) for a landmark. */
export function iconFor(poi: { name: string; category: PoiCategory; icon?: string | null }): string {
  const key = poi.icon || BY_NAME[poi.name] || CATEGORY_DEFAULT[poi.category];
  return GLYPHS[key] ?? GLYPHS[CATEGORY_DEFAULT[poi.category]] ?? GLYPHS.landmark;
}

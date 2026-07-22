// Shared zone model + Mapbox layer helpers.
//
// One source/truth for the RY / STR / HH investment zones so the public map
// (highlight buttons) and the admin preview draw them identically: same colors,
// same value-driven intensity.
//
// Spotlight effect: when a category is active, a single inverted "dim mask"
// (a world-sized rectangle with the active zones punched out as holes) darkens
// everything except the zones, and each active zone gets a semi-transparent
// color fill under its bright border. Everything animates via mapbox paint
// transitions (opacity only) so toggling fades in/out.

import type mapboxgl from "mapbox-gl";

// ── Spotlight look — tweak here ──────────────────────────────────────────────
export const ZONE_DIM_COLOR = "#05070c";   // near-black overlay outside zones
export const ZONE_DIM_OPACITY = 0.55;       // how dark the surroundings get
export const ZONE_FILL_OPACITY = 0.15;      // base zone color fill
export const ZONE_FILL_PULSE = 0.05;        // extra opacity at the pulse peak
export const ZONE_ANIM_MS = 420;            // fade duration
export const ZONE_PULSE = true;             // subtle breathing pulse on fills
// World-sized outer ring for the mask; far exceeds the map's maxBounds so no
// un-dimmed strip shows at the edges when zoomed/panned out.
const WORLD_RING: [number, number][] = [
  [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85],
];
const DIM_SRC = "zone-dim-src";
const DIM_LAYER = "zone-dim";

export type ZoneCategory = "RY" | "STR" | "HH";

export type ZoneRow = {
  id: string;
  name: string;
  category: string; // constrained to ZoneCategory by the DB check, but typed wide from Supabase
  value: number | null;
  geometry: unknown; // GeoJSON Polygon stored as jsonb
  created_at?: string;
};

export const ZONE_CATEGORIES: Record<
  ZoneCategory,
  { label: string; full: string; base: string; color: string }
> = {
  // full  = strong outline for high-value zones
  // base  = dim outline for low/no-value zones (value interpolation floor)
  // color = the swatch shown in the button + legend
  RY: { label: "Rental Yield", full: "#E6B800", base: "#7a6410", color: "#E6B800" },
  STR: { label: "Short-Term Rental", full: "#0FB5AE", base: "#0a5f5b", color: "#0FB5AE" },
  HH: { label: "Holiday Home", full: "#8B5CF6", base: "#4a3184", color: "#8B5CF6" },
};

export const ZONE_ORDER: ZoneCategory[] = ["RY", "STR", "HH"];

// Value scale used for the legend + the data-driven paint (yield %, roughly).
export const ZONE_VALUE_MIN = 0;
export const ZONE_VALUE_MAX = 12;

export function isZoneCategory(v: string): v is ZoneCategory {
  return v === "RY" || v === "STR" || v === "HH";
}

function srcId(cat: ZoneCategory) {
  return `zones-${cat}-src`;
}
function fillId(cat: ZoneCategory) {
  return `zones-${cat}-fill`;
}
function casingId(cat: ZoneCategory) {
  return `zones-${cat}-casing`;
}
function lineId(cat: ZoneCategory) {
  return `zones-${cat}-line`;
}
function labelId(cat: ZoneCategory) {
  return `zones-${cat}-label`;
}

export function zoneLayerIds(cat: ZoneCategory) {
  return { src: srcId(cat), fill: fillId(cat), casing: casingId(cat), line: lineId(cat), label: labelId(cat) };
}

type Ring = [number, number][];

function polygonRings(geometry: unknown): Ring[] {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || g.type !== "Polygon" || !Array.isArray(g.coordinates)) return [];
  return g.coordinates as Ring[];
}

// Cheap ring centroid (average of the outer ring's unique vertices). Good enough
// for placing a label; avoids pulling turf into the public map bundle.
function ringCentroid(ring: Ring): [number, number] | null {
  if (!ring || ring.length === 0) return null;
  // Drop the closing vertex if the ring is closed.
  const pts =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  let x = 0;
  let y = 0;
  for (const [lng, lat] of pts) {
    x += lng;
    y += lat;
  }
  return [x / pts.length, y / pts.length];
}

// GeoJSON polygon features for the outlines, one per zone in the category.
export function buildZonePolygons(zones: ZoneRow[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const z of zones) {
    const rings = polygonRings(z.geometry);
    if (rings.length === 0) continue;
    features.push({
      type: "Feature",
      properties: { id: z.id, name: z.name, value: z.value ?? 0 },
      geometry: { type: "Polygon", coordinates: rings },
    });
  }
  return { type: "FeatureCollection", features };
}

// GeoJSON point features (centroids) for the name labels.
export function buildZoneLabels(zones: ZoneRow[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const z of zones) {
    const rings = polygonRings(z.geometry);
    const c = rings[0] ? ringCentroid(rings[0]) : null;
    if (!c) continue;
    features.push({
      type: "Feature",
      properties: { name: z.name, value: z.value ?? 0 },
      geometry: { type: "Point", coordinates: c },
    });
  }
  return { type: "FeatureCollection", features };
}

// Inverted mask: one polygon whose outer ring is the whole world and whose
// holes are the active zones. Filling it dark darkens everything EXCEPT the
// zones (mapbox treats every ring after the first as a hole). Built by hand so
// no turf import lands in the public map bundle.
export function buildDimMask(activeZones: ZoneRow[]): GeoJSON.FeatureCollection {
  const holes: Ring[] = [];
  for (const z of activeZones) {
    const ring = polygonRings(z.geometry)[0];
    if (ring && ring.length >= 4) holes.push(ring);
  }
  if (holes.length === 0) return emptyFC();
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [WORLD_RING, ...holes] },
      },
    ],
  };
}

// Add all zone sources + layers ONCE (empty). Toggling is done by paint-opacity
// + setData afterwards — never add/remove — which avoids the mapbox symbol-
// placement crash source churn triggers on the Standard style. Adding needs a
// loaded style, so this no-ops until then; the caller retries. Opacity/data
// updates on already-added layers are always safe.
//
// Order (bottom→top): dim mask → per-category fills → casings → lines → labels.
//
// Not gated on isStyleLoaded(): the Mapbox Standard style (3D mode) reports
// false long after add* actually works, which would starve the layers. Each
// add is guarded by an existence check and wrapped so a genuine "style not
// ready" throw is swallowed and simply retried on the next call.
export function ensureZoneLayers(map: mapboxgl.Map) {
  try {
    ensureZoneLayersUnsafe(map);
  } catch {
    // Style not ready yet — caller retries (toggle / idle).
  }
}

function ensureZoneLayersUnsafe(map: mapboxgl.Map) {
  const tr = { duration: ZONE_ANIM_MS } as const;
  const add = (layer: Record<string, unknown>) => (map.addLayer as (l: unknown) => void)(layer);

  // Dim mask (single, shared).
  if (!map.getSource(DIM_SRC)) {
    map.addSource(DIM_SRC, { type: "geojson", data: emptyFC() });
    add({
      id: DIM_LAYER,
      type: "fill",
      source: DIM_SRC,
      paint: {
        "fill-color": ZONE_DIM_COLOR,
        "fill-opacity": 0,
        "fill-opacity-transition": tr,
      },
    });
  }

  // Per-category sources.
  for (const cat of ZONE_ORDER) {
    const ids = zoneLayerIds(cat);
    if (map.getSource(ids.src)) continue;
    map.addSource(ids.src, { type: "geojson", data: emptyFC() });
    map.addSource(`${ids.src}-lbl`, { type: "geojson", data: emptyFC() });
  }

  // Fills (above the mask so the zone reads in its color, not dimmed).
  for (const cat of ZONE_ORDER) {
    const ids = zoneLayerIds(cat);
    if (map.getLayer(ids.fill)) continue;
    add({
      id: ids.fill,
      type: "fill",
      source: ids.src,
      paint: {
        "fill-color": ZONE_CATEGORIES[cat].full,
        "fill-opacity": 0,
        "fill-opacity-transition": tr,
      },
    });
  }

  // Borders + labels on top.
  for (const cat of ZONE_ORDER) {
    const ids = zoneLayerIds(cat);
    const palette = ZONE_CATEGORIES[cat];
    if (map.getLayer(ids.line)) continue;

    const valueExpr = ["coalesce", ["get", "value"], 0] as unknown;
    const colorExpr = [
      "interpolate", ["linear"], valueExpr,
      ZONE_VALUE_MIN, palette.base,
      ZONE_VALUE_MAX, palette.full,
    ] as unknown;
    const widthExpr = [
      "interpolate", ["linear"], valueExpr,
      ZONE_VALUE_MIN, 2,
      ZONE_VALUE_MAX, 3.5,
    ] as unknown;

    add({
      id: ids.casing,
      type: "line",
      source: ids.src,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": palette.full,
        "line-width": ["+", widthExpr, 4],
        "line-opacity": 0,
        "line-blur": 2,
        "line-opacity-transition": tr,
      },
    });
    add({
      id: ids.line,
      type: "line",
      source: ids.src,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": colorExpr,
        "line-width": widthExpr,
        "line-opacity": 0,
        "line-opacity-transition": tr,
      },
    });
    add({
      id: ids.label,
      type: "symbol",
      source: `${ids.src}-lbl`,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": palette.full,
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 1.4,
        "text-opacity": 0,
        "text-opacity-transition": tr,
      },
    });
  }
}

// Refresh geometry + drive the spotlight. Data for every category is always
// present; appearance is pure opacity (so both fade-in and fade-out animate).
// `fillBoost` (0..ZONE_FILL_PULSE) is added to active fills for the breathing
// pulse — pass 0 for a steady fill.
export function applyZones(
  map: mapboxgl.Map,
  zones: ZoneRow[],
  active: Set<ZoneCategory>,
  fillBoost = 0,
) {
  ensureZoneLayers(map);

  // Zone geometry (all categories, always) + the combined dim mask (active only).
  const activeZones: ZoneRow[] = [];
  for (const cat of ZONE_ORDER) {
    const ids = zoneLayerIds(cat);
    const rows = zones.filter((z) => z.category === cat);
    if (active.has(cat)) activeZones.push(...rows);
    (map.getSource(ids.src) as mapboxgl.GeoJSONSource | undefined)?.setData(buildZonePolygons(rows));
    (map.getSource(`${ids.src}-lbl`) as mapboxgl.GeoJSONSource | undefined)?.setData(buildZoneLabels(rows));
  }
  (map.getSource(DIM_SRC) as mapboxgl.GeoJSONSource | undefined)?.setData(buildDimMask(activeZones));

  const anyActive = activeZones.length > 0;
  if (map.getLayer(DIM_LAYER)) {
    map.setPaintProperty(DIM_LAYER, "fill-opacity", anyActive ? ZONE_DIM_OPACITY : 0);
  }

  for (const cat of ZONE_ORDER) {
    const ids = zoneLayerIds(cat);
    const on = active.has(cat);
    if (map.getLayer(ids.fill)) {
      map.setPaintProperty(ids.fill, "fill-opacity", on ? ZONE_FILL_OPACITY + fillBoost : 0);
    }
    if (map.getLayer(ids.casing)) map.setPaintProperty(ids.casing, "line-opacity", on ? 0.28 : 0);
    if (map.getLayer(ids.line)) map.setPaintProperty(ids.line, "line-opacity", on ? 1 : 0);
    if (map.getLayer(ids.label)) map.setPaintProperty(ids.label, "text-opacity", on ? 1 : 0);
  }
}

// Breathing pulse: nudge only the active fills' opacity (no geometry work), so
// it can run on a timer cheaply. `boost` in 0..ZONE_FILL_PULSE.
export function pulseZoneFills(map: mapboxgl.Map, active: Set<ZoneCategory>, boost: number) {
  for (const cat of ZONE_ORDER) {
    if (!active.has(cat)) continue;
    const id = fillId(cat);
    if (map.getLayer(id)) map.setPaintProperty(id, "fill-opacity", ZONE_FILL_OPACITY + boost);
  }
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

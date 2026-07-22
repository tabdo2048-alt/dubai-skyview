// Shared zone model + Mapbox layer helpers.
//
// One source/truth for the RY / STR / HH investment zones so the public map
// (highlight buttons) and the admin preview draw them identically: same colors,
// same outline-only styling, same value-driven intensity. No fill — borders only.

import type mapboxgl from "mapbox-gl";

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
  return { src: srcId(cat), casing: casingId(cat), line: lineId(cat), label: labelId(cat) };
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

// Add every category's sources + layers ONCE (empty, hidden). Toggling is done
// by visibility + setData afterwards — never by add/remove — which avoids the
// mapbox symbol-placement crash that source churn triggers on the Standard style.
// Adding sources/layers needs a loaded style, so this no-ops until then; the
// caller retries. Setting data/visibility on already-added layers is always safe.
export function ensureZoneLayers(map: mapboxgl.Map) {
  if (!map.isStyleLoaded()) return;
  for (const cat of ZONE_ORDER) {
    const ids = zoneLayerIds(cat);
    const palette = ZONE_CATEGORIES[cat];
    if (map.getSource(ids.src)) continue;

    map.addSource(ids.src, { type: "geojson", data: emptyFC() });
    map.addSource(`${ids.src}-lbl`, { type: "geojson", data: emptyFC() });

    // Value-driven color/width: dim+thin at ZONE_VALUE_MIN, full+thick at MAX.
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

    const add = (layer: Record<string, unknown>) =>
      (map.addLayer as (l: unknown) => void)(layer);

    // Wide translucent casing under the solid line so the border "pops".
    add({
      id: ids.casing,
      type: "line",
      source: ids.src,
      layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
      paint: {
        "line-color": palette.full,
        "line-width": ["+", widthExpr, 4],
        "line-opacity": 0.28,
        "line-blur": 2,
      },
    });
    add({
      id: ids.line,
      type: "line",
      source: ids.src,
      layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
      paint: { "line-color": colorExpr, "line-width": widthExpr },
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
        visibility: "none",
      },
      paint: {
        "text-color": palette.full,
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 1.4,
      },
    });
  }
}

// Refresh data + visibility for every category. Adds the layers first if missing.
export function applyZones(map: mapboxgl.Map, zones: ZoneRow[], active: Set<ZoneCategory>) {
  ensureZoneLayers(map);
  for (const cat of ZONE_ORDER) {
    const ids = zoneLayerIds(cat);
    const on = active.has(cat);
    const rows = on ? zones.filter((z) => z.category === cat) : [];
    (map.getSource(ids.src) as mapboxgl.GeoJSONSource | undefined)?.setData(buildZonePolygons(rows));
    (map.getSource(`${ids.src}-lbl`) as mapboxgl.GeoJSONSource | undefined)?.setData(buildZoneLabels(rows));
    const vis = on ? "visible" : "none";
    for (const id of [ids.casing, ids.line, ids.label]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
  }
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

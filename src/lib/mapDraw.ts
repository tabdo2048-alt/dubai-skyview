// Shared polygon-drawing helpers for the admin map editors (zones + project
// plots). Keeps ONE draw/normalise core — both AdminZoneEditor and
// ProjectPlotEditor import from here. Admin-only: turf lands in the admin bundle,
// never the public map bundle (src/lib/zones.ts / projectPlots.ts stay turf-free).
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { area, booleanPointInPolygon, cleanCoords, kinks } from "@turf/turf";

const asFeature = (geometry: GeoJSON.Polygon): GeoJSON.Feature<GeoJSON.Polygon> => ({
  type: "Feature",
  properties: {},
  geometry,
});

/** Auto-close the outer ring and strip duplicate/redundant coords for a clean save. */
export function normalizePolygon(geometry: GeoJSON.Polygon): GeoJSON.Polygon {
  const cleaned = cleanCoords(asFeature(geometry)) as GeoJSON.Feature<GeoJSON.Polygon>;
  const rings = cleaned.geometry.coordinates.map((ring) => {
    if (ring.length === 0) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) return [...ring, first];
    return ring;
  });
  return { type: "Polygon", coordinates: rings };
}

/** The single drawn Polygon from a MapboxDraw instance, or null. */
export function drawnPolygon(draw: MapboxDraw): GeoJSON.Polygon | null {
  const fc = draw.getAll();
  const poly = fc.features.find((f) => f.geometry?.type === "Polygon");
  return poly ? (poly.geometry as GeoJSON.Polygon) : null;
}

/** Distinct vertex count of the outer ring (ignoring the closing repeat). */
export function ringVertexCount(geometry: GeoJSON.Polygon): number {
  const ring = geometry.coordinates[0] ?? [];
  if (ring.length === 0) return 0;
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  return closed ? ring.length - 1 : ring.length;
}

/** Whether the polygon self-intersects (points cross over). */
export function hasKinks(geometry: GeoJSON.Polygon): boolean {
  return kinks(asFeature(geometry)).features.length > 0;
}

/** Area in square metres (turf). */
export function polygonAreaM2(geometry: GeoJSON.Polygon): number {
  return area(asFeature(geometry));
}

/** Whether a [lng,lat] point lies inside the polygon. */
export function markerInsidePlot(lng: number, lat: number, geometry: GeoJSON.Polygon): boolean {
  return booleanPointInPolygon([lng, lat], geometry);
}

/** Compact human area, e.g. "3,240 m²" / "1.24 km²". */
export function formatArea(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(m2).toLocaleString()} m²`;
}

import type { ProjectWithRelations } from "@/lib/types";

export type GeographicPolygon = number[][][];

function isCoordinate(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.length >= 2 && value.every((part) => typeof part === "number")
  );
}

export function projectPlot(project: ProjectWithRelations): GeographicPolygon | null {
  const geometry = project.plot_geometry as { type?: unknown; coordinates?: unknown } | null;
  if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates)) return null;
  const rings = geometry.coordinates.filter(
    (ring): ring is number[][] => Array.isArray(ring) && ring.every(isCoordinate),
  );
  return rings.length ? rings : null;
}

export function pointInRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > latitude !== yj > latitude;
    if (crosses && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi || Number.EPSILON) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(longitude: number, latitude: number, polygon: GeographicPolygon) {
  if (!polygon[0] || !pointInRing(longitude, latitude, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole));
}

export function isInsideAnyProjectPlot(
  longitude: number,
  latitude: number,
  projects: ProjectWithRelations[],
) {
  return projects.some((project) => {
    const polygon = projectPlot(project);
    return polygon ? pointInPolygon(longitude, latitude, polygon) : false;
  });
}

/** Only client-owned parcel geometry is buffered; Google geometry is never extracted. */
export function validPlotGeometry(value: unknown): GeographicPolygon | null {
  if (!value || typeof value !== "object") return null;
  const geometry = value as { type?: string; coordinates?: unknown };
  if (
    geometry.type !== "Polygon" ||
    !Array.isArray(geometry.coordinates) ||
    !geometry.coordinates.length
  )
    return null;
  for (const ring of geometry.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    if (
      !ring.every(
        (p) =>
          isCoordinate(p) &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1]) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 90,
      )
    )
      return null;
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
      return null;
    if (new Set(ring.slice(0, -1).map((p) => `${p[0]},${p[1]}`)).size < 3) return null;
  }
  return geometry.coordinates as GeographicPolygon;
}

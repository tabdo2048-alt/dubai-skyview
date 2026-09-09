import { Cartesian3, PolygonHierarchy } from "cesium";
import type { RuntimeGeoJsonFeature } from "./types";

export type PolygonCoordinates = number[][][];

export function featurePolygons(feature: RuntimeGeoJsonFeature): PolygonCoordinates[] {
  if (feature.geometry.type === "Polygon") return [feature.geometry.coordinates];
  if (feature.geometry.type === "MultiPolygon") return feature.geometry.coordinates;
  return [];
}

export function featureLines(feature: RuntimeGeoJsonFeature): number[][][] {
  if (feature.geometry.type === "LineString") return [feature.geometry.coordinates];
  if (feature.geometry.type === "MultiLineString") return feature.geometry.coordinates;
  return [];
}

function ringToPositions(ring: number[][], height = 0) {
  const values: number[] = [];
  for (const coordinate of ring) {
    if (coordinate.length < 2) continue;
    values.push(coordinate[0], coordinate[1], height);
  }
  return Cartesian3.fromDegreesArrayHeights(values);
}

export function polygonHierarchy(coordinates: PolygonCoordinates, height = 0) {
  const [outer, ...holes] = coordinates;
  if (!outer || outer.length < 3) return null;
  return new PolygonHierarchy(
    ringToPositions(outer, height),
    holes.filter((ring) => ring.length >= 3).map((ring) => new PolygonHierarchy(ringToPositions(ring, height))),
  );
}

export function lineToPositions(line: number[][], height = 0) {
  const values: number[] = [];
  for (const coordinate of line) {
    if (coordinate.length < 2) continue;
    values.push(coordinate[0], coordinate[1], height);
  }
  return Cartesian3.fromDegreesArrayHeights(values);
}

export function polygonCentroid(coordinates: PolygonCoordinates): [number, number] | null {
  const ring = coordinates[0];
  if (!ring?.length) return null;
  let lng = 0;
  let lat = 0;
  let count = 0;
  for (const coordinate of ring) {
    if (coordinate.length < 2) continue;
    lng += coordinate[0];
    lat += coordinate[1];
    count += 1;
  }
  return count ? [lng / count, lat / count] : null;
}


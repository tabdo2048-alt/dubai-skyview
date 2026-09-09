import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { PIPELINE_VERSION } from "./config";

export type Bounds = readonly [number, number, number, number];
export type Properties = Record<string, string | number | boolean | null | undefined>;
export type Feature = {
  type: "Feature";
  id?: string | number;
  properties: Properties;
  geometry:
    | { type: "LineString"; coordinates: number[][] }
    | { type: "MultiLineString"; coordinates: number[][][] }
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
};
export type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
  metadata?: Record<string, unknown>;
};

export async function readJson<T>(filename: string) {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}

export async function writeJson(filename: string, value: unknown) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporary, filename);
}

export async function writeText(filename: string, value: string) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filename);
}

export function provenance(source: string | string[], bounds?: Bounds) {
  return {
    source,
    generatedAt: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    ...(bounds ? { bounds: [...bounds] } : {}),
  };
}

export function insideBounds(longitude: number, latitude: number, bounds: Bounds) {
  const [west, south, east, north] = bounds;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

export function closeRing(coordinates: number[][]) {
  if (coordinates.length < 3) return coordinates;
  const first = coordinates[0];
  const last = coordinates.at(-1);
  return last && first[0] === last[0] && first[1] === last[1]
    ? coordinates
    : [...coordinates, [...first]];
}

export function coordinateSignature(coordinates: number[][]) {
  if (!coordinates.length) return "empty";
  const first = coordinates[0];
  const last = coordinates.at(-1) ?? first;
  return [first[0], first[1], last[0], last[1]]
    .map((value) => Number(value).toFixed(5))
    .join(":");
}

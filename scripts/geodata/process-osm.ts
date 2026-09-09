import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { GEODATA_PATHS, PILOT_AREA } from "./config";
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import {
  closeRing,
  insideBounds,
  provenance,
  readJson,
  writeJson,
  type Feature,
  type FeatureCollection,
  type Properties,
} from "./lib";

type OverpassGeometry = Array<{ lon: number; lat: number }>;
type OverpassElement = {
  type: "way" | "relation";
  id: number;
  tags?: Properties;
  geometry?: OverpassGeometry;
  members?: Array<{ type: string; role?: string; geometry?: OverpassGeometry }>;
};

type PbfItem = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  refs?: number[];
  tags?: Record<string, string>;
  members?: Array<{ type: string; id: number; role?: string }>;
};

function meaningful(tags: Properties) {
  return Boolean(tags.building || tags.highway || tags.natural === "water" || tags.waterway === "riverbank" || tags.leisure === "park" || tags.boundary === "administrative");
}

function relationPolygons(element: OverpassElement) {
  return (element.members ?? [])
    .filter((member) => member.type === "way" && member.role !== "inner" && (member.geometry?.length ?? 0) >= 3)
    .map((member) => [closeRing(member.geometry!.map((point) => [point.lon, point.lat]))]);
}

function processOverpass(elements: OverpassElement[]): FeatureCollection {
  const features: Feature[] = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    if (!meaningful(tags)) continue;
    const id = `osm-${element.type}-${element.id}`;
    if (element.type === "way" && element.geometry?.length) {
      const coordinates = element.geometry.map((point) => [point.lon, point.lat]);
      const polygon = Boolean(tags.building || tags.natural === "water" || tags.waterway === "riverbank" || tags.leisure === "park");
      features.push({
        type: "Feature",
        id,
        properties: { ...tags, osm_type: element.type, osm_id: element.id },
        geometry: polygon
          ? { type: "Polygon", coordinates: [closeRing(coordinates)] }
          : { type: "LineString", coordinates },
      });
    } else if (element.type === "relation") {
      const polygons = relationPolygons(element);
      if (polygons.length) {
        features.push({
          type: "Feature",
          id,
          properties: { ...tags, osm_type: element.type, osm_id: element.id },
          geometry: { type: "MultiPolygon", coordinates: polygons },
        });
      }
    }
  }
  return { type: "FeatureCollection", features, metadata: provenance("OpenStreetMap", PILOT_AREA.bounds) };
}

async function processOsmXml(filename: string): Promise<FeatureCollection> {
  const require = createRequire(import.meta.url);
  const osmToGeoJson = require("osmtogeojson") as (document: Document) => {
    features: Array<{ id?: string | number; properties?: { tags?: Properties } & Properties; geometry?: Feature["geometry"] }>;
  };
  const document = new DOMParser().parseFromString(await readFile(filename, "utf8"), "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error(`Invalid OSM XML: ${filename}`);
  const converted = osmToGeoJson(document as unknown as Document);
  const features = converted.features.flatMap((feature): Feature[] => {
    if (!feature.geometry || !["LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(feature.geometry.type)) return [];
    const rawProperties = feature.properties ?? {};
    const tags = rawProperties.tags ?? rawProperties;
    if (!meaningful(tags)) return [];
    return [{
      type: "Feature",
      id: feature.id,
      properties: { ...tags, source_id: feature.id },
      geometry: feature.geometry,
    }];
  });
  return { type: "FeatureCollection", features, metadata: provenance("OpenStreetMap XML", PILOT_AREA.bounds) };
}

async function processPbf(filename: string): Promise<FeatureCollection> {
  const require = createRequire(import.meta.url);
  const parsePbf = require("osm-pbf-parser") as () => NodeJS.ReadWriteStream;
  const nodes = new Map<number, [number, number]>();
  const ways = new Map<number, { refs: number[]; tags: Properties }>();
  const features: Feature[] = [];
  const parser = parsePbf();
  createReadStream(filename).pipe(parser);
  for await (const batch of parser as AsyncIterable<PbfItem[]>) {
    for (const item of batch) {
      if (item.type === "node" && item.lon != null && item.lat != null && insideBounds(item.lon, item.lat, PILOT_AREA.bounds)) {
        nodes.set(item.id, [item.lon, item.lat]);
      } else if (item.type === "way" && item.refs) {
        const coordinates = item.refs.flatMap((ref) => (nodes.has(ref) ? [nodes.get(ref)!] : []));
        if (coordinates.length < 2) continue;
        const tags = item.tags ?? {};
        // Keep local way geometry even when the way itself has no useful tags:
        // administrative/water multipolygon relations commonly reference plain
        // outer ways and carry the meaningful tags on the relation instead.
        ways.set(item.id, { refs: item.refs, tags });
        if (!meaningful(tags)) continue;
        const polygon = Boolean(tags.building || tags.natural === "water" || tags.waterway === "riverbank" || tags.leisure === "park");
        features.push({
          type: "Feature",
          id: `osm-way-${item.id}`,
          properties: { ...tags, osm_type: "way", osm_id: item.id },
          geometry: polygon
            ? { type: "Polygon", coordinates: [closeRing(coordinates)] }
            : { type: "LineString", coordinates },
        });
      } else if (item.type === "relation" && meaningful(item.tags ?? {})) {
        const polygons = (item.members ?? [])
          .filter((member) => member.type === "way" && member.role !== "inner" && ways.has(member.id))
          .map((member) => [closeRing(ways.get(member.id)!.refs.flatMap((ref) => (nodes.has(ref) ? [nodes.get(ref)!] : [])))])
          .filter((polygon) => polygon[0].length >= 4);
        if (polygons.length) {
          features.push({
            type: "Feature",
            id: `osm-relation-${item.id}`,
            properties: { ...(item.tags ?? {}), osm_type: "relation", osm_id: item.id },
            geometry: { type: "MultiPolygon", coordinates: polygons },
          });
        }
      }
    }
  }
  return { type: "FeatureCollection", features, metadata: provenance("OpenStreetMap PBF", PILOT_AREA.bounds) };
}

const pbfFlag = process.argv.indexOf("--pbf");
const inputPbf = pbfFlag >= 0 ? process.argv[pbfFlag + 1] || GEODATA_PATHS.osmPbf : null;
if (inputPbf && !existsSync(inputPbf)) throw new Error(`PBF not found: ${inputPbf}`);
const output = inputPbf
  ? await processPbf(inputPbf)
  : existsSync(GEODATA_PATHS.osmPilot)
    ? processOverpass((await readJson<{ elements: OverpassElement[] }>(GEODATA_PATHS.osmPilot)).elements)
    : await processOsmXml(GEODATA_PATHS.osmPilotXml);
await writeJson(GEODATA_PATHS.intermediateOsm, output);
console.log(`Processed ${output.features.length} OSM features into ${GEODATA_PATHS.intermediateOsm}`);

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import { GEODATA_PATHS, PILOT_AREA } from "./config";
import { closeRing, provenance, type Feature, type FeatureCollection } from "./lib";

function parseCoordinates(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((coordinate) => coordinate.split(",").slice(0, 2).map(Number))
    .filter((coordinate) => coordinate.length === 2 && coordinate.every(Number.isFinite));
}

function firstText(element: Element, tag: string) {
  return element.getElementsByTagName(tag).item(0)?.textContent?.trim() || undefined;
}

export async function importCommunityKml(filename = GEODATA_PATHS.communityKml): Promise<FeatureCollection | null> {
  if (!existsSync(filename)) return null;
  const document = new DOMParser().parseFromString(await readFile(filename, "utf8"), "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error(`Invalid KML: ${filename}`);
  const features: Feature[] = [];
  const placemarks = document.getElementsByTagName("Placemark");
  for (let index = 0; index < placemarks.length; index += 1) {
    const placemark = placemarks.item(index);
    if (!placemark) continue;
    const polygon = placemark.getElementsByTagName("Polygon").item(0);
    const coordinateText = polygon ? firstText(polygon, "coordinates") : undefined;
    if (!coordinateText) continue;
    const ring = closeRing(parseCoordinates(coordinateText));
    if (ring.length < 4) continue;
    features.push({
      type: "Feature",
      id: `dm-community-${index + 1}`,
      properties: { name: firstText(placemark, "name") || `Community ${index + 1}`, source_priority: "official" },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }
  return {
    type: "FeatureCollection",
    features,
    metadata: { ...provenance("Dubai Municipality — dm_community-open", PILOT_AREA.bounds), official: true },
  };
}

export function processOsmCommunities(input: FeatureCollection): FeatureCollection {
  return {
    ...input,
    features: input.features.filter(
      (feature) => feature.properties.boundary === "administrative" && Boolean(feature.properties.name),
    ),
  };
}


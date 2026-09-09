import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import { GEODATA_PATHS, PILOT_AREA } from "./config";
import { provenance, writeJson, type Feature, type FeatureCollection } from "./lib";

function coordinateLine(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((coordinate) => coordinate.split(",").slice(0, 2).map(Number))
    .filter((coordinate) => coordinate.length === 2 && coordinate.every(Number.isFinite));
}

function text(element: Element, tag: string) {
  return element.getElementsByTagName(tag).item(0)?.textContent?.trim() || undefined;
}

export async function importRtaMajorRoads(
  input = GEODATA_PATHS.rtaRoadsKml,
  output = GEODATA_PATHS.rtaRoads,
): Promise<FeatureCollection | null> {
  if (!existsSync(input)) return null;
  const document = new DOMParser().parseFromString(await readFile(input, "utf8"), "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error(`Invalid KML: ${input}`);
  const features: Feature[] = [];
  const placemarks = document.getElementsByTagName("Placemark");
  for (let index = 0; index < placemarks.length; index += 1) {
    const placemark = placemarks.item(index);
    if (!placemark) continue;
    const name = text(placemark, "name") || `RTA major road ${index + 1}`;
    const lineStrings = placemark.getElementsByTagName("LineString");
    for (let lineIndex = 0; lineIndex < lineStrings.length; lineIndex += 1) {
      const coordinatesText = text(lineStrings.item(lineIndex)!, "coordinates");
      if (!coordinatesText) continue;
      const coordinates = coordinateLine(coordinatesText);
      if (coordinates.length < 2) continue;
      features.push({
        type: "Feature",
        id: `rta-road-${index + 1}-${lineIndex + 1}`,
        properties: { name, highway: "primary", road_class: "primary", source_priority: "rta-official" },
        geometry: { type: "LineString", coordinates },
      });
    }
  }
  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features,
    metadata: { ...provenance("RTA — rta_major_roads-open", PILOT_AREA.bounds), official: true },
  };
  await writeJson(output, collection);
  console.log(`Imported ${features.length} RTA major-road segments`);
  return collection;
}

if (process.argv[1]?.includes("import-rta-major-roads")) {
  const roads = await importRtaMajorRoads();
  if (!roads) console.log(`Skipped: place the official KML at ${GEODATA_PATHS.rtaRoadsKml}`);
}


import path from "node:path";
import { GEODATA_PATHS, PILOT_AREA } from "./config";
import { readJson, type Feature, type FeatureCollection } from "./lib";

const errors: string[] = [];
const warnings: string[] = [];

function coordinates(feature: Feature): number[][] {
  if (feature.geometry.type === "LineString") return feature.geometry.coordinates;
  if (feature.geometry.type === "MultiLineString") return feature.geometry.coordinates.flat();
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates.flat();
  return feature.geometry.coordinates.flat(2);
}

function validateCollection(name: string, collection: FeatureCollection) {
  const ids = new Set<string>();
  for (const feature of collection.features) {
    const id = String(feature.id ?? "");
    if (!id) errors.push(`${name}: feature without id`);
    if (ids.has(id)) errors.push(`${name}: duplicate id ${id}`);
    ids.add(id);
    const points = coordinates(feature);
    if (!points.length) errors.push(`${name}/${id}: empty geometry`);
    for (const [longitude, latitude] of points) {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
        errors.push(`${name}/${id}: invalid coordinate ${longitude},${latitude}`);
        break;
      }
    }
    if (name === "buildings") {
      const height = Number(feature.properties.height_m);
      if (!Number.isFinite(height) || height < 3 || height > 500) errors.push(`${name}/${id}: impossible height ${height}`);
    }
    if (name === "roads" && feature.properties.bridge === true) {
      const layer = Number(feature.properties.layer);
      if (!Number.isFinite(layer) || layer < 1) errors.push(`${name}/${id}: invalid bridge layer`);
    }
  }
  if (!collection.features.length) warnings.push(`${name}: no features generated`);
}

const directory = path.posix.join(GEODATA_PATHS.outputRoot, PILOT_AREA.id);
const layers = Object.fromEntries(
  await Promise.all(
    (["buildings", "roads", "water", "communities"] as const).map(async (name) => [
      name,
      await readJson<FeatureCollection>(path.posix.join(directory, `${name}.geojson`)),
    ]),
  ),
) as Record<"buildings" | "roads" | "water" | "communities", FeatureCollection>;

for (const [name, collection] of Object.entries(layers)) validateCollection(name, collection);
const buildingSources = layers.buildings.features.reduce<Record<string, number>>((summary, feature) => {
  const source = String(feature.properties.height_source ?? "unknown");
  summary[source] = (summary[source] ?? 0) + 1;
  return summary;
}, {});
const bridgeCount = layers.roads.features.filter((feature) => feature.properties.bridge === true).length;
const tunnelCount = layers.roads.features.filter((feature) => feature.properties.tunnel === true).length;

console.log(JSON.stringify({
  area: PILOT_AREA.name,
  buildingsProcessed: layers.buildings.features.length,
  buildingHeightSources: buildingSources,
  roadSegments: layers.roads.features.length,
  bridges: bridgeCount,
  tunnels: tunnelCount,
  waterFeatures: layers.water.features.length,
  communities: layers.communities.features.length,
  warnings,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;


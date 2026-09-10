import { existsSync } from "node:fs";
import path from "node:path";
import { GEODATA_PATHS, PILOT_AREA, PIPELINE_VERSION } from "./config";
import { coordinateSignature, provenance, readJson, writeJson, type FeatureCollection } from "./lib";
import { importMunicipalityBuildings } from "./import-dubai-municipality-buildings";
import { importRtaMajorRoads } from "./import-rta-major-roads";
import { mergeBuildingMetadata } from "./merge-building-metadata";
import { processBuildings } from "./process-buildings";
import { importCommunityKml, processOsmCommunities } from "./process-communities";
import { processRoads } from "./process-roads";
import { processParks } from "./process-parks";
import { processWater } from "./process-water";

function withMetadata(collection: FeatureCollection, source: string | string[]) {
  return {
    ...collection,
    metadata: { ...provenance(source, PILOT_AREA.bounds), license: source.toString().includes("OpenStreetMap") ? "ODbL-1.0" : undefined },
  };
}

function mergeRtaRoads(osm: FeatureCollection, rta: FeatureCollection | null) {
  if (!rta) return osm;
  const officialSignatures = new Set(
    rta.features.flatMap((feature) =>
      feature.geometry.type === "LineString" ? [coordinateSignature(feature.geometry.coordinates)] : [],
    ),
  );
  const osmWithoutDuplicates = osm.features.filter((feature) => {
    if (feature.geometry.type !== "LineString") return true;
    return !officialSignatures.has(coordinateSignature(feature.geometry.coordinates));
  });
  return {
    type: "FeatureCollection" as const,
    features: [...rta.features, ...osmWithoutDuplicates],
    metadata: provenance(["RTA — rta_major_roads-open", "OpenStreetMap"], PILOT_AREA.bounds),
  };
}

if (!existsSync(GEODATA_PATHS.intermediateOsm)) {
  throw new Error(`Missing ${GEODATA_PATHS.intermediateOsm}. Run geodata:process:osm first.`);
}

if (existsSync(GEODATA_PATHS.municipalityBuildings)) await importMunicipalityBuildings();
const importedRta = await importRtaMajorRoads();
const officialCommunities = await importCommunityKml();
const osm = await readJson<FeatureCollection>(GEODATA_PATHS.intermediateOsm);
const osmBuildings: FeatureCollection = {
  ...osm,
  features: osm.features.filter((feature) => Boolean(feature.properties.building)),
};
const { buildings: mergedBuildings, statistics: matchStatistics } = await mergeBuildingMetadata(osmBuildings);
const buildings = withMetadata(processBuildings(mergedBuildings), ["OpenStreetMap", "Dubai Municipality metadata when explicitly matched"]);
const roads = withMetadata(mergeRtaRoads(processRoads(osm), importedRta), importedRta ? ["RTA", "OpenStreetMap"] : "OpenStreetMap");
const water = withMetadata(processWater(osm), "OpenStreetMap");
const parks = withMetadata(processParks(osm), "OpenStreetMap");
const communities = officialCommunities ?? withMetadata(processOsmCommunities(osm), "OpenStreetMap");

const chunkDirectory = path.posix.join(GEODATA_PATHS.outputRoot, PILOT_AREA.id);
await Promise.all([
  writeJson(path.posix.join(chunkDirectory, "buildings.geojson"), buildings),
  writeJson(path.posix.join(chunkDirectory, "roads.geojson"), roads),
  writeJson(path.posix.join(chunkDirectory, "water.geojson"), water),
  writeJson(path.posix.join(chunkDirectory, "parks.geojson"), parks),
  writeJson(path.posix.join(chunkDirectory, "communities.geojson"), communities),
]);

await writeJson(path.posix.join(GEODATA_PATHS.outputRoot, "manifest.json"), {
  version: 1,
  pilotArea: PILOT_AREA.name,
  metadata: { ...provenance("OpenStreetMap and optional official Dubai datasets", PILOT_AREA.bounds), pipelineVersion: PIPELINE_VERSION },
  chunks: [
    {
      id: PILOT_AREA.id,
      bounds: [...PILOT_AREA.bounds],
      files: {
        buildings: `/geodata/dubai-pilot/${PILOT_AREA.id}/buildings.geojson`,
        roads: `/geodata/dubai-pilot/${PILOT_AREA.id}/roads.geojson`,
        water: `/geodata/dubai-pilot/${PILOT_AREA.id}/water.geojson`,
        parks: `/geodata/dubai-pilot/${PILOT_AREA.id}/parks.geojson`,
        communities: `/geodata/dubai-pilot/${PILOT_AREA.id}/communities.geojson`,
      },
    },
  ],
});

console.log(JSON.stringify({
  buildings: buildings.features.length,
  roads: roads.features.length,
  water: water.features.length,
  parks: parks.features.length,
  communities: communities.features.length,
  municipalityMatches: matchStatistics,
}, null, 2));

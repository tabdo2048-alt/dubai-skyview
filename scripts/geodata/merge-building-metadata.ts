import { existsSync } from "node:fs";
import { GEODATA_PATHS } from "./config";
import { readJson, type FeatureCollection } from "./lib";
import type { MunicipalityBuilding } from "./import-dubai-municipality-buildings";

export type MatchStatistics = {
  official: number;
  highConfidence: number;
  probable: number;
  unmatchedBuildings: number;
  unmatchedOfficialRecords: number;
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function mergeBuildingMetadata(buildings: FeatureCollection) {
  const statistics: MatchStatistics = {
    official: 0,
    highConfidence: 0,
    probable: 0,
    unmatchedBuildings: 0,
    unmatchedOfficialRecords: 0,
  };
  if (!existsSync(GEODATA_PATHS.officialBuildingMetadata)) {
    statistics.unmatchedBuildings = buildings.features.length;
    return { buildings, statistics };
  }
  const payload = await readJson<{ records: MunicipalityBuilding[] }>(GEODATA_PATHS.officialBuildingMetadata);
  const byId = new Map(payload.records.map((record) => [record.building_id, record]));
  const used = new Set<string>();
  const merged = buildings.features.map((feature) => {
    const properties = feature.properties;
    const explicitId = String(properties["ref:dm"] ?? properties.building_id ?? "").trim();
    let record = explicitId ? byId.get(explicitId) : undefined;
    let confidence: "official" | "probable" | "unmatched" = record ? "official" : "unmatched";
    if (!record) {
      const name = normalized(properties.name);
      const community = normalized(properties["addr:district"] ?? properties.community);
      if (name && community) {
        record = payload.records.find(
          (candidate) =>
            normalized(candidate.building_type) === name &&
            normalized(candidate.community_name_english) === community,
        );
        if (record) confidence = "probable";
      }
    }
    if (!record) {
      statistics.unmatchedBuildings += 1;
      return feature;
    }
    used.add(record.building_id);
    statistics[confidence === "official" ? "official" : "probable"] += 1;
    return {
      ...feature,
      properties: {
        ...properties,
        municipality_building_id: record.building_id,
        municipality_match_confidence: confidence,
        // Official height is only trusted for an explicit official ID match.
        ...(confidence === "official" && record.building_height
          ? { official_height_m: record.building_height }
          : {}),
        official_height_candidate_m: record.building_height,
        building_usage: record.building_usage,
        community_name_english: record.community_name_english,
      },
    };
  });
  statistics.unmatchedOfficialRecords = payload.records.length - used.size;
  return { buildings: { ...buildings, features: merged }, statistics };
}


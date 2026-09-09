import { createReadStream, existsSync } from "node:fs";
import { parse } from "csv-parse";
import { GEODATA_PATHS } from "./config";
import { provenance, writeJson } from "./lib";

export type MunicipalityBuilding = {
  building_id: string;
  parcel_id?: string;
  building_height?: number;
  typical_floors_count?: number;
  building_type?: string;
  building_usage?: string;
  building_total_area?: number;
  building_status?: string;
  building_construction_year?: string;
  project_no?: string;
  community_no?: string;
  community_name_english?: string;
};

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && String(value).trim() ? number : undefined;
}

export async function importMunicipalityBuildings(
  input = GEODATA_PATHS.municipalityBuildings,
  output = GEODATA_PATHS.officialBuildingMetadata,
) {
  if (!existsSync(input)) return null;
  const records: MunicipalityBuilding[] = [];
  const parser = createReadStream(input).pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }));
  for await (const raw of parser as AsyncIterable<Record<string, string>>) {
    const buildingId = raw.building_id?.trim();
    if (!buildingId) continue;
    records.push({
      building_id: buildingId,
      parcel_id: raw.parcel_id?.trim() || undefined,
      building_height: numberOrUndefined(raw.building_height),
      typical_floors_count: numberOrUndefined(raw.typical_floors_count),
      building_type: raw.building_type?.trim() || undefined,
      building_usage: raw.building_usage?.trim() || undefined,
      building_total_area: numberOrUndefined(raw.building_total_area),
      building_status: raw.building_status?.trim() || undefined,
      building_construction_year: raw.building_construction_year?.trim() || undefined,
      project_no: raw.project_no?.trim() || undefined,
      community_no: raw.community_no?.trim() || undefined,
      community_name_english: raw.community_name_english?.trim() || undefined,
    });
  }
  await writeJson(output, { metadata: provenance("Dubai Municipality — dm_building_summary_information-open"), records });
  console.log(`Imported ${records.length} Dubai Municipality building records`);
  return records;
}

if (process.argv[1]?.includes("import-dubai-municipality-buildings")) {
  const records = await importMunicipalityBuildings();
  if (!records) console.log(`Skipped: place the official CSV at ${GEODATA_PATHS.municipalityBuildings}`);
}


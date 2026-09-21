export type ProjectFeatureAvailability = "available" | "reserved" | "sold";

export interface ProjectFeatureReader {
  hasProperty: (name: string) => boolean;
  getProperty: (name: string) => unknown;
}

function firstValue(feature: ProjectFeatureReader, keys: string[]): string | undefined {
  for (const key of keys) {
    if (!feature.hasProperty(key)) continue;
    const value = feature.getProperty(key);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function availability(value: string | undefined): ProjectFeatureAvailability | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "available" || normalized === "reserved" || normalized === "sold") {
    return normalized;
  }
  return undefined;
}

export function readProjectFeatureMetadata(feature: ProjectFeatureReader) {
  const featureName = firstValue(feature, [
    "feature_name",
    "name",
    "Name",
    "unit_name",
    "tower",
    "building",
    "id",
  ]);
  const floorLabel = firstValue(feature, [
    "floor_name",
    "floor_label",
    "floor",
    "floor_number",
    "level",
  ]);
  const unitTypeId = firstValue(feature, ["unit_type_id", "unitTypeId", "unit_id", "unitId"]);
  const unitAvailability = availability(
    firstValue(feature, ["availability", "unit_availability", "status"]),
  );
  const featureType = firstValue(feature, ["feature_type", "type", "category"]);

  return { featureName, floorLabel, unitTypeId, availability: unitAvailability, featureType };
}

/**
 * 3D Tiles availability colors are applied only when the authored feature metadata contains
 * availability / unit_availability / status. The white fallback preserves untagged materials.
 */
export const PROJECT_AVAILABILITY_STYLE_CONDITIONS: Array<[string, string]> = [
  [
    "${availability} === 'available' || ${availability} === 'Available' || ${unit_availability} === 'available' || ${unit_availability} === 'Available' || ${status} === 'available' || ${status} === 'Available'",
    "color('#22c55e', 0.58)",
  ],
  [
    "${availability} === 'reserved' || ${availability} === 'Reserved' || ${unit_availability} === 'reserved' || ${unit_availability} === 'Reserved' || ${status} === 'reserved' || ${status} === 'Reserved'",
    "color('#d4af37', 0.62)",
  ],
  [
    "${availability} === 'sold' || ${availability} === 'Sold' || ${unit_availability} === 'sold' || ${unit_availability} === 'Sold' || ${status} === 'sold' || ${status} === 'Sold'",
    "color('#64748b', 0.68)",
  ],
  ["true", "color('white')"],
];

const AVAILABILITY_COLORS: Record<ProjectFeatureAvailability, string> = {
  available: "color('#22c55e', 0.58)",
  reserved: "color('#d4af37', 0.62)",
  sold: "color('#64748b', 0.68)",
};

export function projectAvailabilityStyleConditions(
  units: Array<{ id: string; availability: string | null }>,
): Array<[string, string]> {
  const byUnit = units.flatMap((unit): Array<[string, string]> => {
    const status = availability(unit.availability ?? undefined);
    // Current unit identifiers are UUIDs. Refuse unexpected values before embedding an expression.
    if (!status || !/^[a-zA-Z0-9_-]+$/.test(unit.id)) return [];
    const condition =
      `\${unit_type_id} === '${unit.id}' || \${unitTypeId} === '${unit.id}' || ` +
      `\${unit_id} === '${unit.id}' || \${unitId} === '${unit.id}'`;
    return [[condition, AVAILABILITY_COLORS[status]]];
  });
  return [...byUnit, ...PROJECT_AVAILABILITY_STYLE_CONDITIONS];
}

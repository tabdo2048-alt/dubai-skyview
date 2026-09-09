export const PIPELINE_VERSION = 1;

export const PILOT_AREA = {
  id: "business-bay-downtown",
  name: "Business Bay / Downtown Dubai",
  // west, south, east, north — intentionally compact for Overpass development use.
  bounds: [55.255, 25.185, 55.275, 25.205] as const,
};

export const GEODATA_PATHS = {
  osmPbf: "data/geodata/raw/osm/uae-latest.osm.pbf",
  osmPilot: "data/geodata/raw/osm/business-bay-downtown.overpass.json",
  osmPilotXml: "data/geodata/raw/osm/business-bay-downtown.osm",
  municipalityBuildings:
    "data/geodata/raw/dubai-pulse/Building_Summary_Information.csv",
  communityKml: "data/geodata/raw/dubai-pulse/Community.kml",
  rtaRoadsKml: "data/geodata/raw/dubai-pulse/Major_Roads.kml",
  intermediateOsm: "data/geodata/intermediate/osm-pilot.json",
  officialBuildingMetadata:
    "data/geodata/intermediate/dubai-municipality-buildings.json",
  rtaRoads: "data/geodata/intermediate/rta-major-roads.geojson",
  outputRoot: "public/geodata/dubai-pilot",
} as const;

export const HEIGHT_FALLBACKS = {
  floorHeightM: 3.2,
  byTypeM: {
    residential: 15,
    apartments: 24,
    commercial: 20,
    hotel: 28,
    industrial: 9,
    retail: 8,
    unknown: 12,
  },
} as const;

export const ESTIMATED_ROAD_ELEVATION = {
  bridgeBaseClearanceM: 7,
  layerStepM: 6,
} as const;

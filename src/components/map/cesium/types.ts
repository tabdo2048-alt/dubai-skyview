import type { ProjectWithRelations } from "@/lib/types";
import type { PoiPoint } from "@/hooks/use-pois";
import type { EmirateView } from "@/lib/dubai";
import type { ZoneCategory, ZoneRow } from "@/lib/zones";
import type { LightPreset, MapCameraState } from "../mapTypes";

export type CesiumViewProps = {
  ionToken?: string;
  projects: ProjectWithRelations[];
  pois?: PoiPoint[];
  browsingPois?: boolean;
  flyToTarget?: EmirateView | null;
  zones?: ZoneRow[];
  zoneCategories?: Set<ZoneCategory>;
  camera: MapCameraState;
  onCameraChange: (camera: MapCameraState) => void;
  onReady?: () => void;
  active: boolean;
  metroMode: boolean;
  trainMode: boolean;
  roadsMode: boolean;
  lightPreset: LightPreset;
};

export type ProjectPick = {
  kind: "project" | "project-feature";
  projectId: string;
  featureKey?: string;
  featureName?: string;
  source?: "marker" | "glb" | "3d-tiles";
  featureType?: string;
  floorLabel?: string;
  unitTypeId?: string;
  availability?: "available" | "reserved" | "sold";
};

export type RuntimeFeatureProperties = Record<string, string | number | boolean | null | undefined>;

export type RuntimeGeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties?: RuntimeFeatureProperties;
  geometry:
    | { type: "Point"; coordinates: number[] }
    | { type: "LineString"; coordinates: number[][] }
    | { type: "MultiLineString"; coordinates: number[][][] }
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
};

export type RuntimeGeoJson = {
  type: "FeatureCollection";
  features: RuntimeGeoJsonFeature[];
  metadata?: RuntimeAssetMetadata;
};

export type RuntimeAssetMetadata = {
  source: string | string[];
  sourceDate?: string;
  generatedAt: string;
  pipelineVersion: number;
  license?: string;
  bounds?: [number, number, number, number];
};

export type RuntimeLayerName = "parks" | "buildings" | "roads" | "water" | "communities";

export type RuntimeGeodataChunk = {
  id: string;
  bounds: [number, number, number, number];
  files: Partial<Record<RuntimeLayerName, string>>;
};

export type RuntimeGeodataManifest = {
  version: 1;
  pilotArea: string;
  metadata: RuntimeAssetMetadata;
  chunks: RuntimeGeodataChunk[];
};

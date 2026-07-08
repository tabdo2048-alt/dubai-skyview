// Shared types for the Mapbox 3D model system (Model3DLayer + modelRegistry).
//
// A ModelConfig describes one placeable 3D object on the Dubai map: where it
// sits, how big it is, and (optionally) a water/air route it animates along.
// The layer loads a GLB from `modelUrl`, falling back to a low-poly procedural
// placeholder when the file is missing so the map never crashes.

export type ModelType = "boat" | "yacht" | "ship" | "abra" | "train" | "cloud" | "custom";

export type ModelConfig = {
  /** Stable unique id, e.g. "marina-yacht-01". */
  id: string;
  /** Human-readable label. */
  name: string;
  /** Category — drives the procedural placeholder shape + default wake width. */
  type: ModelType;
  /** Path to a GLB under public/, e.g. "/models/yacht.glb". */
  modelUrl: string;

  /** Home position (used when `route` is absent, or as the route's start). */
  lng: number;
  lat: number;
  /** Metres above ground. Boats ride at ~0; clouds sit high. */
  altitude: number;

  /** Uniform scale multiplier applied on top of the model's own size. */
  scale: number;
  /** Euler rotation in radians [x, y, z], applied before heading alignment. */
  rotation: [number, number, number];
  /** Optional hull color override for the procedural placeholder (hex, e.g. 0xffffff). */
  color?: number;

  /** When true, the model advances along `route` each frame. */
  animate: boolean;
  /** Ordered [lng, lat] waypoints the model loops along (water routes only). */
  route?: [number, number][];
  /** Fraction of the route travelled per second (e.g. 0.03). */
  speed?: number;

  /** Only rendered while the map zoom is within [from, to]. */
  visibleFromZoom: number;
  visibleToZoom: number;
};

/** A hex color for the procedural placeholder hull, keyed by model type. */
export const PLACEHOLDER_COLORS: Record<ModelType, number> = {
  boat: 0xffffff,
  yacht: 0xffffff,
  ship: 0x9fb4c7,
  abra: 0x8d6e63,
  train: 0xc9a84c,
  cloud: 0xffffff,
  custom: 0xcccccc,
};

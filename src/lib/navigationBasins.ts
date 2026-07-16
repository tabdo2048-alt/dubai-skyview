// Basin navigation water for in-harbour vessels (abras, boats, small yachts).
//
// This is the counterpart to navigationWater.ts. That file describes only the
// DEEP OPEN GULF where big ships sail; this file describes the sheltered coastal
// basins — Dubai Marina, Palm Jumeirah inner lagoon, Dubai Creek, and the
// Business Bay / Dubai Water Canal — where small craft circulate.
//
// Design: a basin is modelled as a CORRIDOR — a centerline polyline plus a
// half-width in metres — clipped to the real water polygon traced in water.ts.
// A point is valid basin navigation water when it is BOTH:
//   1. within `halfWidthMeters` of the basin centerline, AND
//   2. inside the basin's source water polygon from WATER_AREAS (so the corridor
//      never spills onto land even where the centerline runs near a bank).
//
// The corridor model (rather than an inward-inset polygon) is deliberate: the
// Creek and Business Bay water polygons are thin slivers that an inset would
// collapse, and Marina/Palm-lagoon corridors follow the navigable channel rather
// than the whole basin. The basin routes in marineRoutes.ts ARE these
// centerlines, so every routed vessel sits on the corridor spine by construction.
//
// Coordinates are [lng, lat]. Centerlines are derived to sit mid-channel in the
// satellite-traced water polygons of water.ts; refine with the Water Debug Editor.

import { WATER_AREAS, type WaterArea } from "@/lib/water";

// The Dubai Creek water polygon pinches nearly shut around lat 25.227, so the
// creek is modelled as two independent corridors (south of the pinch, north of
// it) rather than one that would have to squeeze through a ~4m gap.
export type BasinId = "marina" | "palm-lagoon" | "creek-south" | "creek-north" | "business-bay" | "jbr";

export type BasinCorridor = {
  id: BasinId;
  name: string;
  /**
   * Id of the source water polygon in water.ts this corridor is clipped to.
   * Optional: corridors whose rendered basin was removed/replaced by the OSM
   * water rebuild carry their own `waterRing`/`waterHoles` instead (below).
   */
  waterAreaId?: string;
  /**
   * Self-contained navigation water polygon for this corridor, decoupled from
   * the visual WATER_AREAS. When present it overrides the `waterAreaId` lookup
   * in `isInsideBasinWater`. Used for the palm-lagoon and jbr corridors, whose
   * centerlines were sampled/validated against these exact rings before the
   * OSM water rebuild collapsed/replaced their rendered basins.
   */
  waterRing?: [number, number][];
  /** Island/land holes punched out of `waterRing`. */
  waterHoles?: [number, number][][];
  /** Centerline the corridor is built around; also the vessel route spine. */
  centerline: [number, number][];
  /** Half-width of the navigable corridor in metres (full width = 2×). */
  halfWidthMeters: number;
};

const METERS_PER_LATITUDE_DEGREE = 111_320;

// --- Self-contained navigation masks ----------------------------------------
// These are the water polygons the palm-lagoon and jbr corridors were sampled
// and validated against. They are kept here — deliberately separate from the
// visual WATER_AREAS, exactly like navigationWater.ts — so the OSM water
// geometry rebuild (which replaces the rendered jbr sea with the unified open
// sea and re-derives the Palm lagoon from OSM) cannot move a bank out from
// under a routed vessel. Copied verbatim from the pre-rebuild water.ts.

// Simplified trunk + frond comb for Palm Jumeirah (5 fronds per side).
const PALM_LAGOON_NAV_TRUNK_FRONDS: [number, number][] = [
  [55.1388, 25.091],
  [55.1388, 25.098],
  [55.134, 25.098],
  [55.134, 25.101],
  [55.1388, 25.101],
  [55.1388, 25.107],
  [55.134, 25.107],
  [55.134, 25.11],
  [55.1388, 25.11],
  [55.1388, 25.116],
  [55.134, 25.116],
  [55.134, 25.119],
  [55.1388, 25.119],
  [55.1388, 25.125],
  [55.134, 25.125],
  [55.134, 25.128],
  [55.1388, 25.128],
  [55.1388, 25.134],
  [55.134, 25.134],
  [55.134, 25.137],
  [55.1388, 25.137],
  [55.1388, 25.144],
  [55.1412, 25.144],
  [55.1412, 25.137],
  [55.147, 25.137],
  [55.147, 25.134],
  [55.1412, 25.134],
  [55.1412, 25.128],
  [55.147, 25.128],
  [55.147, 25.125],
  [55.1412, 25.125],
  [55.1412, 25.119],
  [55.147, 25.119],
  [55.147, 25.116],
  [55.1412, 25.116],
  [55.1412, 25.11],
  [55.147, 25.11],
  [55.147, 25.107],
  [55.1412, 25.107],
  [55.1412, 25.101],
  [55.147, 25.101],
  [55.147, 25.098],
  [55.1412, 25.098],
  [55.1412, 25.091],
  [55.1388, 25.091],
];

// Palm Jumeirah inner lagoon water ring (between crescent and trunk/fronds).
const PALM_LAGOON_NAV_RING: [number, number][] = [
  [55.105, 25.1051],
  [55.1057, 25.1067],
  [55.1068, 25.1082],
  [55.1083, 25.1096],
  [55.1101, 25.1109],
  [55.1123, 25.1121],
  [55.1148, 25.1131],
  [55.1175, 25.1139],
  [55.1205, 25.1146],
  [55.1236, 25.1151],
  [55.1269, 25.1154],
  [55.1302, 25.1156],
  [55.1335, 25.1156],
  [55.1368, 25.1154],
  [55.14, 25.115],
  [55.1431, 25.1144],
  [55.146, 25.1135],
  [55.1486, 25.1124],
  [55.151, 25.111],
  [55.1531, 25.1094],
  [55.1549, 25.1075],
  [55.1564, 25.1053],
  [55.1577, 25.1039],
  [55.155, 25.1],
  [55.15, 25.096],
  [55.14, 25.093],
  [55.13, 25.093],
  [55.12, 25.096],
  [55.11, 25.1],
  [55.105, 25.1051],
];

// Mainland coastline strip along Marina/JBR — hole so the jbr corridor never
// spills onto the beachfront/promenade.
const JBR_NAV_MAINLAND: [number, number][] = [
  [55.125227, 25.073428],
  [55.12581, 25.075447],
  [55.127277, 25.074693],
  [55.131713, 25.078592],
  [55.135687, 25.084118],
  [55.136546, 25.088363],
  [55.135183, 25.088707],
  [55.133779, 25.089426],
  [55.134162, 25.091951],
  [55.135669, 25.092168],
  [55.137557, 25.091696],
  [55.143433, 25.086957],
  [55.166, 25.075],
  [55.166, 25.05],
  [55.1, 25.05],
  [55.115, 25.06],
  [55.123, 25.068],
];

// JBR offshore water ring — exposed sea in front of the JBR beachfront.
const JBR_NAV_RING: [number, number][] = [
  [55.115, 25.058],
  [55.108, 25.065],
  [55.1, 25.075],
  [55.095, 25.086],
  [55.093, 25.098],
  [55.097, 25.113],
  [55.099, 25.108],
  [55.102, 25.104],
  [55.106, 25.1005],
  [55.111, 25.0975],
  [55.117, 25.0955],
  [55.124, 25.0945],
  [55.132, 25.094],
  [55.14, 25.094],
  [55.148, 25.094],
  [55.155, 25.0945],
  [55.161, 25.0955],
  [55.166, 25.07],
  [55.16, 25.066],
  [55.15, 25.062],
  [55.135, 25.058],
  [55.12, 25.055],
  [55.115, 25.058],
];

// Centerlines run mid-channel through each basin's water polygon (water.ts).
// Half-widths are sized to the basin: wide for the Marina/Palm lagoon, tight for
// the narrow Creek and Business Bay canal.
// All centerlines below were generated by sampling the mid-water line of the
// corresponding water.ts polygon and verified so that every point of the route,
// sampled every 25 m (matching the guard), stays inside the water polygon (and
// outside island holes). Half-widths bound runtime drift, not the trace itself.
export const BASIN_CORRIDORS: BasinCorridor[] = [
  {
    id: "marina",
    name: "Dubai Marina Channel",
    waterAreaId: "marina-channels",
    // Mid-channel line resampled from the real OSM marina polygon (relation
    // 6200028): for each latitude slice, the widest inside interval's
    // midpoint, tracked for continuity across the entrance-channel forks.
    centerline: [
      [55.13113, 25.06942],
      [55.131, 25.06986],
      [55.13019, 25.0703],
      [55.13167, 25.07074],
      [55.13264, 25.07117],
      [55.13305, 25.07161],
      [55.13407, 25.07205],
      [55.13458, 25.07249],
      [55.13479, 25.07293],
      [55.13488, 25.07337],
      [55.13495, 25.07381],
      [55.13506, 25.07424],
      [55.13537, 25.07468],
      [55.13604, 25.07512],
      [55.13696, 25.07556],
      [55.13772, 25.076],
      [55.13807, 25.07644],
      [55.13816, 25.07687],
      [55.13832, 25.07731],
      [55.13862, 25.07775],
      [55.13948, 25.07819],
      [55.13927, 25.07863],
      [55.13971, 25.07907],
      [55.14036, 25.0795],
      [55.1411, 25.07994],
      [55.14205, 25.08038],
      [55.14232, 25.08082],
      [55.14323, 25.08126],
      [55.14364, 25.0817],
      [55.14316, 25.08213],
      [55.14295, 25.08257],
      [55.14295, 25.08242],
      [55.14318, 25.08226],
      [55.14349, 25.0821],
      [55.1438, 25.08202],
      [55.14411, 25.0821],
      [55.14434, 25.08226],
      [55.1445, 25.08242],
      [55.14481, 25.08259],
      [55.14511, 25.08275],
      [55.14542, 25.08291],
      [55.14558, 25.08301],
      [55.14602, 25.08345],
      [55.14653, 25.08389],
      [55.14658, 25.08433],
      [55.14649, 25.08476],
      [55.14651, 25.0852],
      [55.14628, 25.08564],
      [55.14625, 25.08608],
      [55.14584, 25.08652],
      [55.14609, 25.08696],
      [55.1461, 25.08689],
      [55.14581, 25.08668],
      [55.14552, 25.08654],
      [55.14523, 25.08646],
      [55.14494, 25.08646],
      [55.14465, 25.08646],
      [55.14436, 25.08668],
      [55.14407, 25.08689],
      [55.14379, 25.08711],
      [55.1435, 25.08732],
      [55.14341, 25.0874],
      [55.14283, 25.08783],
      [55.14228, 25.08827],
      [55.14175, 25.08871],
      [55.1414, 25.08915],
      [55.14133, 25.08959],
      [55.14131, 25.09003],
      [55.14195, 25.09046],
      [55.14228, 25.0909],
      [55.14223, 25.09134],
      [55.14221, 25.09178],
      [55.14219, 25.09222],
      [55.14223, 25.09215],
      [55.14223, 25.09194],
      [55.14223, 25.09172],
      [55.14212, 25.09151],
      [55.14181, 25.0913],
      [55.14149, 25.09108],
      [55.14117, 25.09087],
      [55.14085, 25.09065],
      [55.14054, 25.09044],
      [55.14045, 25.09044],
      [55.1404, 25.09037],
      [55.14022, 25.09044],
      [55.14022, 25.09047],
      [55.14015, 25.09056],
      [55.14022, 25.09065],
      [55.14022, 25.09087],
      [55.14022, 25.09108],
      [55.14022, 25.0913],
      [55.14022, 25.09151],
      [55.14001, 25.09172],
      [55.13969, 25.09194],
      [55.13937, 25.09215],
      [55.13905, 25.09237],
      [55.13874, 25.09258],
      [55.13867, 25.09266],
      [55.13846, 25.09309],
      [55.13821, 25.09353],
      [55.13862, 25.09397],
      [55.13858, 25.09441],
      [55.13851, 25.09485],
    ],
    halfWidthMeters: 45,
  },
  {
    id: "palm-lagoon",
    name: "Palm Jumeirah Inner Lagoon",
    // Rendered basin id kept for wave-intensity matching (calm 0.25 lagoon);
    // clipping uses the self-contained ring below, not the rebuilt geometry.
    waterAreaId: "palm-lagoon",
    waterRing: PALM_LAGOON_NAV_RING,
    waterHoles: [PALM_LAGOON_NAV_TRUNK_FRONDS],
    // A gentle arc through the lagoon between the crescent and the fronds, kept
    // clear of the trunk/frond comb (the polygon hole).
    centerline: [
      [55.1105, 25.1015],
      [55.115, 25.104],
      [55.121, 25.1055],
      [55.127, 25.106],
      [55.1305, 25.1055],
      [55.128, 25.1048],
      [55.123, 25.1045],
      [55.1175, 25.1042],
      [55.113, 25.1028],
    ],
    halfWidthMeters: 60,
  },
  {
    id: "creek-south",
    name: "Dubai Creek (South)",
    waterAreaId: "dubai-creek",
    // Mid-channel line resampled from the real OSM creek polygon (relation
    // 6525149, both banks stitched), restricted to the same lat window as
    // before (below the mid-estuary pinch).
    centerline: [
      [55.34403, 25.213],
      [55.34429, 25.21354],
      [55.34462, 25.21408],
      [55.34489, 25.21463],
      [55.34509, 25.21517],
      [55.34529, 25.21571],
      [55.34536, 25.21625],
      [55.34529, 25.21679],
      [55.34536, 25.21733],
      [55.34562, 25.21787],
      [55.34609, 25.21842],
      [55.34656, 25.21896],
      [55.34709, 25.2195],
      [55.34729, 25.22004],
      [55.34715, 25.22058],
      [55.34809, 25.22113],
      [55.34802, 25.22167],
      [55.34722, 25.22221],
      [55.34722, 25.22275],
      [55.34695, 25.22329],
      [55.34669, 25.22383],
      [55.34656, 25.22437],
      [55.34656, 25.22492],
      [55.34636, 25.22546],
      [55.34622, 25.226],
    ],
    halfWidthMeters: 20,
  },
  {
    id: "creek-north",
    name: "Dubai Creek (North)",
    waterAreaId: "dubai-creek",
    // Mid-channel line resampled from the real OSM creek polygon, restricted
    // to the same lat window as before (above the pinch, toward the mouth).
    centerline: [
      [55.34569, 25.228],
      [55.34536, 25.22845],
      [55.34442, 25.2289],
      [55.34389, 25.22935],
      [55.34316, 25.2298],
      [55.34276, 25.23025],
      [55.34223, 25.2307],
      [55.3411, 25.23115],
      [55.34116, 25.2316],
      [55.33957, 25.23205],
      [55.33937, 25.2325],
      [55.33903, 25.23295],
      [55.33737, 25.2334],
      [55.33664, 25.23385],
      [55.33617, 25.2343],
      [55.33531, 25.23475],
      [55.33484, 25.2352],
      [55.33457, 25.23565],
      [55.33417, 25.2361],
      [55.33357, 25.23655],
      [55.33298, 25.237],
      [55.33244, 25.23745],
      [55.33218, 25.2379],
      [55.33191, 25.23835],
      [55.33111, 25.2388],
      [55.33091, 25.23925],
      [55.33085, 25.2397],
      [55.33065, 25.24015],
      [55.33031, 25.2406],
      [55.33005, 25.24105],
      [55.32978, 25.2415],
      [55.32951, 25.24195],
      [55.32938, 25.2424],
      [55.32925, 25.24285],
      [55.32918, 25.2433],
      [55.32931, 25.24375],
      [55.32931, 25.2442],
      [55.32931, 25.24465],
      [55.32925, 25.2451],
      [55.32845, 25.24555],
      [55.32838, 25.246],
    ],
    halfWidthMeters: 20,
  },
  {
    id: "business-bay",
    name: "Dubai Water Canal & Business Bay",
    waterAreaId: "business-bay-canal",
    // Mid-channel line resampled from the real OSM canal way (532459082,
    // "Dubai Canal"), full length from the Gulf mouth to Business Bay.
    centerline: [
      [55.23388, 25.19599],
      [55.23554, 25.19569],
      [55.23721, 25.19542],
      [55.23887, 25.19465],
      [55.24054, 25.1936],
      [55.2422, 25.19191],
      [55.24387, 25.18943],
      [55.24553, 25.18863],
      [55.2472, 25.18734],
      [55.24886, 25.18629],
      [55.25052, 25.186],
      [55.25219, 25.1861],
      [55.25385, 25.18607],
      [55.25552, 25.1856],
      [55.25718, 25.18448],
      [55.25885, 25.18334],
      [55.26051, 25.18274],
      [55.26218, 25.18237],
      [55.26384, 25.18222],
      [55.26551, 25.18202],
      [55.26717, 25.18209],
      [55.26884, 25.18269],
      [55.2705, 25.18339],
      [55.27217, 25.1847],
      [55.27383, 25.18418],
      [55.27549, 25.18329],
      [55.27716, 25.18281],
      [55.27882, 25.18271],
      [55.28049, 25.18299],
      [55.28215, 25.18368],
      [55.28382, 25.18503],
      [55.28548, 25.18791],
      [55.28715, 25.18903],
      [55.28881, 25.19122],
      [55.29048, 25.19268],
      [55.29214, 25.1935],
      [55.29381, 25.19373],
      [55.29547, 25.19333],
      [55.29713, 25.19281],
      [55.2988, 25.19239],
      [55.30046, 25.19229],
      [55.30213, 25.19258],
      [55.30379, 25.19368],
      [55.30546, 25.1952],
      [55.30712, 25.19825],
      [55.30879, 25.19937],
      [55.31045, 25.19957],
      [55.31212, 25.20024],
      [55.31378, 25.20193],
      [55.31545, 25.20333],
      [55.31711, 25.20402],
      [55.31877, 25.20425],
      [55.32044, 25.2041],
      [55.3221, 25.2041],
      [55.32377, 25.20417],
      [55.32543, 25.2041],
      [55.3271, 25.20452],
      [55.32876, 25.20479],
      [55.33043, 25.20504],
    ],
    halfWidthMeters: 22,
  },
  {
    id: "jbr",
    name: "JBR Offshore Water",
    // No rendered basin after the rebuild — JBR water is part of the unified
    // open sea. Clip to the self-contained ring; wave intensity falls to the
    // open-sea default (1). Centerline sampled from the pre-rebuild
    // jbr-offshore polygon, offset west of the real JBR beachfront.
    waterRing: JBR_NAV_RING,
    waterHoles: [JBR_NAV_MAINLAND],
    centerline: [
      [55.11332, 25.073],
      [55.1132, 25.07363],
      [55.11304, 25.07427],
      [55.11284, 25.0749],
      [55.11408, 25.07553],
      [55.11444, 25.07617],
      [55.1148, 25.0768],
      [55.11516, 25.07743],
      [55.11552, 25.07807],
      [55.11588, 25.0787],
      [55.11612, 25.07933],
      [55.11632, 25.07997],
      [55.11656, 25.0806],
      [55.1168, 25.08123],
      [55.117, 25.08187],
      [55.11724, 25.0825],
      [55.11748, 25.08313],
      [55.11768, 25.08377],
      [55.11784, 25.0844],
      [55.11792, 25.08503],
      [55.118, 25.08567],
      [55.11804, 25.0863],
      [55.11812, 25.08693],
      [55.11816, 25.08757],
      [55.11824, 25.0882],
      [55.11744, 25.08883],
      [55.11688, 25.08947],
      [55.11692, 25.0901],
      [55.11696, 25.09073],
      [55.117, 25.09137],
      [55.11724, 25.092],
    ],
    halfWidthMeters: 200,
  },
];

// --- geometry helpers -------------------------------------------------------
function pointInRing(point: [number, number], ring: [number, number][]) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegmentMeters(
  point: [number, number],
  start: [number, number],
  end: [number, number],
) {
  const meanLatitude = ((point[1] + start[1] + end[1]) * Math.PI) / 540;
  const lngScale = METERS_PER_LATITUDE_DEGREE * Math.cos(meanLatitude);
  const px = (point[0] - start[0]) * lngScale;
  const py = (point[1] - start[1]) * METERS_PER_LATITUDE_DEGREE;
  const ex = (end[0] - start[0]) * lngScale;
  const ey = (end[1] - start[1]) * METERS_PER_LATITUDE_DEGREE;
  const lengthSquared = ex * ex + ey * ey;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * ex + py * ey) / lengthSquared));
  return Math.hypot(px - ex * t, py - ey * t);
}

function distanceToPolylineMeters(point: [number, number], line: [number, number][]) {
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i++) {
    nearest = Math.min(nearest, distanceToSegmentMeters(point, line[i - 1], line[i]));
  }
  return nearest;
}

const waterAreaById = new Map<string, WaterArea>(WATER_AREAS.map((area) => [area.id, area]));

/** True when the point sits inside the given basin's source water polygon. */
function isInsideBasinWater(point: [number, number], corridor: BasinCorridor) {
  let ring: [number, number][];
  let holes: [number, number][][];
  if (corridor.waterRing) {
    // Self-contained nav mask (palm-lagoon, jbr) — decoupled from WATER_AREAS.
    ring = corridor.waterRing;
    holes = corridor.waterHoles ?? [];
  } else {
    const area = corridor.waterAreaId ? waterAreaById.get(corridor.waterAreaId) : undefined;
    if (!area) return false;
    ring = area.polygon;
    holes = area.holes ?? [];
  }
  if (!pointInRing(point, ring)) return false;
  // Reject anything inside a hole (island/land punched out of the basin).
  for (const hole of holes) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

/**
 * True when the point is safe basin navigation water: within the corridor of at
 * least one basin AND inside that basin's water polygon.
 */
export function isPointInAnyBasinNavigationWater(point: [number, number]) {
  return BASIN_CORRIDORS.some(
    (corridor) =>
      distanceToPolylineMeters(point, corridor.centerline) <= corridor.halfWidthMeters &&
      isInsideBasinWater(point, corridor),
  );
}

/** The basin whose corridor the point falls in, if any (nearest centerline). */
export function basinForPoint(point: [number, number]): BasinCorridor | undefined {
  let best: BasinCorridor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const corridor of BASIN_CORRIDORS) {
    const distance = distanceToPolylineMeters(point, corridor.centerline);
    if (
      distance <= corridor.halfWidthMeters &&
      distance < bestDistance &&
      isInsideBasinWater(point, corridor)
    ) {
      best = corridor;
      bestDistance = distance;
    }
  }
  return best;
}

/** Corridor outline rings (for the navigation debug overlay), one per basin. */
export function basinCorridorRing(corridor: BasinCorridor): [number, number][] {
  // Build a simple buffered ribbon: offset each centerline vertex left/right by
  // the half-width along the local normal, then walk down one side and back the
  // other to close the ring. Good enough for a debug outline.
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const line = corridor.centerline;
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    const meanLat = (line[i][1] * Math.PI) / 180;
    const lngScale = METERS_PER_LATITUDE_DEGREE * Math.cos(meanLat);
    const dx = (next[0] - prev[0]) * lngScale;
    const dy = (next[1] - prev[1]) * METERS_PER_LATITUDE_DEGREE;
    const len = Math.hypot(dx, dy) || 1;
    // Normal (perpendicular) unit vector in metres, converted back to degrees.
    const nx = (-dy / len) * (corridor.halfWidthMeters / lngScale);
    const ny = (dx / len) * (corridor.halfWidthMeters / METERS_PER_LATITUDE_DEGREE);
    left.push([line[i][0] + nx, line[i][1] + ny]);
    right.push([line[i][0] - nx, line[i][1] - ny]);
  }
  return [...left, ...right.reverse(), left[0]];
}

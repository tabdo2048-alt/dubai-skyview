// Open-water wave tracks. These are individual animated foam crests, not filled
// sea polygons, so satellite imagery stays visible and no blue dome appears.
export type OpenSeaWavePath = {
  id: string;
  points: [number, number][];
  intensity: number;
  widthMeters: number;
};

export const OPEN_SEA_WAVE_PATHS: OpenSeaWavePath[] = [
  // Wide west-east Gulf swells.
  {
    id: "gulf-wide-swell-01",
    intensity: 0.74,
    widthMeters: 30,
    points: [
      [54.94, 25.205],
      [55.0, 25.219],
      [55.075, 25.225],
      [55.155, 25.223],
      [55.225, 25.212],
    ],
  },
  {
    id: "gulf-wide-swell-02",
    intensity: 0.68,
    widthMeters: 28,
    points: [
      [54.955, 25.19],
      [55.025, 25.202],
      [55.095, 25.206],
      [55.17, 25.202],
      [55.235, 25.19],
    ],
  },
  {
    id: "gulf-wide-swell-03",
    intensity: 0.7,
    widthMeters: 28,
    points: [
      [54.98, 25.174],
      [55.045, 25.185],
      [55.115, 25.188],
      [55.185, 25.181],
      [55.245, 25.168],
    ],
  },

  // Diagonal open-sea streaks like the drawn reference paths.
  {
    id: "gulf-diagonal-swell-01",
    intensity: 0.64,
    widthMeters: 26,
    points: [
      [54.93, 25.162],
      [55.0, 25.185],
      [55.07, 25.209],
      [55.14, 25.232],
      [55.22, 25.252],
    ],
  },
  {
    id: "gulf-diagonal-swell-02",
    intensity: 0.58,
    widthMeters: 24,
    points: [
      [54.98, 25.246],
      [55.04, 25.228],
      [55.095, 25.207],
      [55.15, 25.184],
      [55.205, 25.166],
    ],
  },
  {
    id: "gulf-diagonal-swell-03",
    intensity: 0.52,
    widthMeters: 22,
    points: [
      [54.965, 25.162],
      [55.035, 25.178],
      [55.105, 25.197],
      [55.175, 25.22],
    ],
  },

  // Short vertical wave lanes across the whole sea, kept offshore.
  {
    id: "gulf-vertical-swell-01",
    intensity: 0.5,
    widthMeters: 22,
    points: [
      [54.945, 25.16],
      [54.95, 25.186],
      [54.952, 25.214],
      [54.954, 25.242],
    ],
  },
  {
    id: "gulf-vertical-swell-02",
    intensity: 0.46,
    widthMeters: 20,
    points: [
      [55.085, 25.165],
      [55.087, 25.19],
      [55.09, 25.218],
      [55.094, 25.248],
    ],
  },
  {
    id: "gulf-vertical-swell-03",
    intensity: 0.48,
    widthMeters: 20,
    points: [
      [55.17, 25.164],
      [55.174, 25.19],
      [55.18, 25.217],
      [55.188, 25.242],
    ],
  },

  // Palm/JBR nearby swells, lighter and still offshore.
  {
    id: "palm-west-swell-01",
    intensity: 0.56,
    widthMeters: 22,
    points: [
      [55.064, 25.146],
      [55.083, 25.158],
      [55.105, 25.164],
      [55.13, 25.162],
    ],
  },
  {
    id: "palm-north-swell-01",
    intensity: 0.62,
    widthMeters: 24,
    points: [
      [55.093, 25.153],
      [55.111, 25.163],
      [55.13, 25.164],
      [55.149, 25.155],
    ],
  },
  {
    id: "jbr-offshore-swell-01",
    intensity: 0.5,
    widthMeters: 20,
    points: [
      [55.03, 25.158],
      [55.07, 25.166],
      [55.11, 25.169],
      [55.15, 25.164],
    ],
  },
];

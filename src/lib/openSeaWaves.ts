// Sparse, open-water wave tracks. These are individual foam crests, not a
// filled sea polygon, so the satellite imagery remains completely visible.
export type OpenSeaWavePath = {
  id: string;
  points: [number, number][];
  intensity: number;
  widthMeters: number;
};

export const OPEN_SEA_WAVE_PATHS: OpenSeaWavePath[] = [
  {
    id: "gulf-west-swell-01",
    intensity: 0.95,
    widthMeters: 32,
    points: [
      [55.052, 25.085],
      [55.061, 25.103],
      [55.07, 25.121],
      [55.079, 25.138],
    ],
  },
  {
    id: "gulf-west-swell-02",
    intensity: 0.82,
    widthMeters: 28,
    points: [
      [55.055, 25.112],
      [55.065, 25.13],
      [55.077, 25.147],
      [55.091, 25.16],
    ],
  },
  {
    id: "gulf-north-swell-01",
    intensity: 1.0,
    widthMeters: 34,
    points: [
      [55.068, 25.158],
      [55.09, 25.168],
      [55.114, 25.174],
      [55.138, 25.17],
    ],
  },
  {
    id: "gulf-north-swell-02",
    intensity: 0.88,
    widthMeters: 30,
    points: [
      [55.074, 25.146],
      [55.096, 25.157],
      [55.12, 25.162],
      [55.145, 25.156],
    ],
  },
  {
    id: "palm-west-swell-01",
    intensity: 0.8,
    widthMeters: 28,
    points: [
      [55.064, 25.096],
      [55.073, 25.111],
      [55.083, 25.126],
      [55.094, 25.139],
    ],
  },
  {
    id: "palm-north-swell-01",
    intensity: 0.92,
    widthMeters: 32,
    points: [
      [55.093, 25.153],
      [55.111, 25.163],
      [55.13, 25.164],
      [55.149, 25.155],
    ],
  },
];

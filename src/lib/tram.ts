// Dubai Tram — real operational line (Al Sufouh <-> Dubai Marina <-> JBR),
// hand-curated from the RTA "Dubai Metro Guide" (Dec 2025 edition). The
// Google My Maps KML source for the rest of the network has no Tram folder,
// but Tram is a real line running through the exact Marina/JBR area this
// product highlights, and the app's legend/color palette already promises
// it (CATEGORY_COLORS.tram in metro.ts). Salvaged from the retired
// metroAccurate.ts before that file was deleted.
import type { MetroLine } from "./metro";

const TRAM_STATIONS: { name: string; coord: [number, number]; interchange?: boolean }[] = [
  { name: "Al Sufouh", coord: [55.1649, 25.1043] },
  { name: "Media City", coord: [55.1576, 25.0976] },
  { name: "Palm Jumeirah", coord: [55.1497, 25.0948], interchange: true },
  { name: "Knowledge Village", coord: [55.1613, 25.1006] },
  { name: "Mina Seyahi", coord: [55.1469, 25.088] },
  { name: "Dubai Marina Mall", coord: [55.1403, 25.0796] },
  { name: "Dubai Marina", coord: [55.1389, 25.0764], interchange: true },
  { name: "Jumeirah Beach Residence 1", coord: [55.1334, 25.0734] },
  { name: "Jumeirah Beach Residence 2", coord: [55.13, 25.0768] },
  { name: "Marina Towers", coord: [55.142, 25.078] },
  { name: "Sobha Realty", coord: [55.14754, 25.08], interchange: true },
];

export const DUBAI_TRAM: MetroLine = {
  id: "dubai-tram",
  name: "Dubai Tram",
  color: "#F2994A",
  status: "operational",
  path: TRAM_STATIONS.map((s) => s.coord),
  stations: TRAM_STATIONS.map((s, i) => ({
    id: `dubai-tram-st-${i + 1}`,
    name: s.name,
    coord: s.coord,
    interchange: s.interchange,
  })),
};

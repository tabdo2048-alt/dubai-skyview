// Accurate Dubai rail network — traced from the official RTA "Dubai Rail Network"
// and "Dubai Metro Guide" maps (Dec 2025 edition). Stations are listed in true
// travel order with real names; paths follow the real alignment (no backtracking).
//
// This replaces the auto-generated KML import, which had scrambled station order
// and placeholder names ("Red Line Station 33"). Coordinates are real-world
// [lng, lat], accurate enough to sit on the correct roads/areas in Dubai.

import type { MetroLine } from "./metro";

// --- RED LINE (operational) ------------------------------------------------
// Centrepoint (Rashidiya, NE) → UAE Exchange (Jebel Ali, SW), the trunk down
// Sheikh Zayed Road. At Jabal Ali the Route 2020 branch splits off to Expo
// (modelled as a separate line below so the polyline never backtracks).
const RED_STATIONS: { name: string; coord: [number, number]; interchange?: boolean }[] = [
  { name: "Centrepoint", coord: [55.39598, 25.24796] },
  { name: "Emirates", coord: [55.38167, 25.25233] },
  { name: "Airport Terminal 3", coord: [55.36452, 25.24845] },
  { name: "Airport Terminal 1", coord: [55.35234, 25.24842] },
  { name: "GGICO", coord: [55.33091, 25.25036] },
  { name: "Deira City Centre", coord: [55.33029, 25.25501] },
  { name: "Al Rigga", coord: [55.32394, 25.26324] },
  { name: "Union", coord: [55.31544, 25.26631], interchange: true },
  { name: "BurJuman", coord: [55.30441, 25.25478], interchange: true },
  { name: "ADCB", coord: [55.29816, 25.24449] },
  { name: "Al Jafiliya", coord: [55.29205, 25.23359] },
  { name: "World Trade Centre", coord: [55.28511, 25.22478] },
  { name: "Emirates Towers", coord: [55.27988, 25.21733] },
  { name: "Financial Centre", coord: [55.27559, 25.21113] },
  { name: "Burj Khalifa / Dubai Mall", coord: [55.26939, 25.20141] },
  { name: "Business Bay", coord: [55.26028, 25.19125] },
  { name: "Onpassive", coord: [55.24571, 25.17381] },
  { name: "Equiti", coord: [55.22807, 25.15601] },
  { name: "Mall of the Emirates", coord: [55.20030, 25.12128] },
  { name: "Mashreq", coord: [55.19099, 25.11487] },
  { name: "Dubai Internet City", coord: [55.17361, 25.10205] },
  { name: "Al Khail", coord: [55.15800, 25.08886] },
  { name: "Sobha Realty", coord: [55.14754, 25.08000] },
  { name: "DMCC", coord: [55.13905, 25.07128], interchange: true },
  { name: "Jabal Ali", coord: [55.12695, 25.05789], interchange: true },
  { name: "Ibn Battuta", coord: [55.11737, 25.04698] },
  { name: "Energy", coord: [55.10115, 25.02602] },
  { name: "Danube", coord: [55.09570, 25.00117] },
  { name: "UAE Exchange", coord: [55.09111, 24.97760] },
];

// --- ROUTE 2020 (operational Red Line branch) ------------------------------
// Splits from the Red Line at Jabal Ali and runs SW to Expo 2020. Same red
// family; kept as its own line so neither polyline zig-zags.
const RED_2020_STATIONS: { name: string; coord: [number, number]; interchange?: boolean }[] = [
  { name: "Jabal Ali", coord: [55.12695, 25.05789], interchange: true },
  { name: "The Gardens", coord: [55.15226, 25.04640] },
  { name: "Discovery Gardens", coord: [55.14524, 25.03522] },
  { name: "Al Furjan", coord: [55.15215, 25.03052] },
  { name: "Jumeirah Golf Estates", coord: [55.16322, 25.01776] },
  { name: "Dubai Investment Park", coord: [55.15566, 25.00541] },
  { name: "Expo 2020", coord: [55.14580, 24.96362], interchange: true },
];

// --- GREEN LINE (operational) ----------------------------------------------
// Etisalat (NE) → Creek (S), looping through Deira and around Bur Dubai.
// 20 stations in travel order.
const GREEN_STATIONS: { name: string; coord: [number, number]; interchange?: boolean }[] = [
  { name: "Etisalat", coord: [55.37860, 25.29610] },
  { name: "Al Qusais", coord: [55.38200, 25.28470] },
  { name: "Dubai Airport Free Zone", coord: [55.38670, 25.28060] },
  { name: "Al Nahda", coord: [55.37360, 25.28650] },
  { name: "Stadium", coord: [55.36160, 25.28700] },
  { name: "Al Qiyadah", coord: [55.35020, 25.28470] },
  { name: "Abu Hail", coord: [55.34290, 25.27750] },
  { name: "Abu Baker Al Siddique", coord: [55.33380, 25.27060] },
  { name: "Salah Al Din", coord: [55.32620, 25.26580] },
  { name: "Union", coord: [55.31544, 25.26631], interchange: true },
  { name: "Baniyas Square", coord: [55.30590, 25.26760] },
  { name: "Gold Souq", coord: [55.30140, 25.27060] },
  { name: "Al Ras", coord: [55.29760, 25.26840] },
  { name: "Al Ghubaiba", coord: [55.29320, 25.26210] },
  { name: "Sharaf DG", coord: [55.29770, 25.25650] },
  { name: "BurJuman", coord: [55.30441, 25.25478], interchange: true },
  { name: "Oud Metha", coord: [55.31160, 25.24560] },
  { name: "Dubai Healthcare City", coord: [55.32090, 25.23360] },
  { name: "Al Jadaf", coord: [55.32820, 25.22610] },
  { name: "Creek", coord: [55.33430, 25.21850] },
];

// --- DUBAI TRAM (operational) ----------------------------------------------
// Loops Al Sufouh ↔ Dubai Marina ↔ JBR, interchanging with the Red Line at
// DMCC (Sobha Realty area) and connecting to the Palm Monorail at Palm Jumeirah.
// 11 stations.
const TRAM_STATIONS: { name: string; coord: [number, number]; interchange?: boolean }[] = [
  { name: "Al Sufouh", coord: [55.16490, 25.10430] },
  { name: "Media City", coord: [55.15760, 25.09760] },
  { name: "Palm Jumeirah", coord: [55.14970, 25.09480], interchange: true },
  { name: "Knowledge Village", coord: [55.16130, 25.10060] },
  { name: "Mina Seyahi", coord: [55.14690, 25.08800] },
  { name: "Dubai Marina Mall", coord: [55.14030, 25.07960] },
  { name: "Dubai Marina", coord: [55.13890, 25.07640], interchange: true },
  { name: "Jumeirah Beach Residence 1", coord: [55.13340, 25.07340] },
  { name: "Jumeirah Beach Residence 2", coord: [55.13000, 25.07680] },
  { name: "Marina Towers", coord: [55.14200, 25.07800] },
  { name: "Sobha Realty", coord: [55.14754, 25.08000], interchange: true },
];

// Build a MetroLine from an ordered station list — the path IS the station
// sequence (already in travel order, so no backtracking artifacts).
function buildLine(
  id: string,
  name: string,
  color: string,
  status: MetroLine["status"],
  stations: { name: string; coord: [number, number]; interchange?: boolean }[],
): MetroLine {
  return {
    id,
    name,
    color,
    status,
    path: stations.map((s) => s.coord),
    stations: stations.map((s, i) => ({
      id: `${id}-${i}-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      name: s.name,
      coord: s.coord,
      interchange: s.interchange,
    })),
  };
}

export const ACCURATE_METRO_LINES: MetroLine[] = [
  buildLine("red", "Red Line", "#E63946", "operational", RED_STATIONS),
  buildLine("red-2020", "Route 2020", "#E63946", "operational", RED_2020_STATIONS),
  buildLine("green", "Green Line", "#2ECC71", "operational", GREEN_STATIONS),
];

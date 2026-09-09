import { writeJson, writeText } from "./lib";
import { GEODATA_PATHS, PILOT_AREA } from "./config";

const endpoint = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const [west, south, east, north] = PILOT_AREA.bounds;
const bbox = `${south},${west},${north},${east}`;
const query = `[out:json][timeout:120];(
  way[building](${bbox});relation[building](${bbox});
  way[highway](${bbox});
  way[natural=water](${bbox});relation[natural=water](${bbox});
  way[waterway=riverbank](${bbox});relation[waterway=riverbank](${bbox});
  way[leisure=park](${bbox});relation[leisure=park](${bbox});
  relation[boundary=administrative](${bbox});
);out tags geom;`;

const headers = {
  "user-agent": "DubaiSkyviewGeodataPipeline/1.0 (OpenStreetMap pilot generation)",
};
const response = await fetch(endpoint, {
  method: "POST",
  headers: { ...headers, "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
  body: new URLSearchParams({ data: query }),
});
if (response.ok) {
  const payload = await response.json();
  await writeJson(GEODATA_PATHS.osmPilot, payload);
  console.log(`Downloaded OSM pilot data for ${PILOT_AREA.name} to ${GEODATA_PATHS.osmPilot}`);
} else {
  // The read-only OSM map endpoint is only a development fallback for this tiny
  // bbox. Citywide generation must use the local PBF path, never tiled API calls.
  console.warn(`Overpass unavailable (${response.status}); using the small-area OSM API fallback.`);
  const mapUrl = `https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`;
  const mapResponse = await fetch(mapUrl, { headers });
  if (!mapResponse.ok) throw new Error(`OSM map API failed: ${mapResponse.status} ${mapResponse.statusText}`);
  await writeText(GEODATA_PATHS.osmPilotXml, await mapResponse.text());
  console.log(`Downloaded OSM XML pilot data to ${GEODATA_PATHS.osmPilotXml}`);
}

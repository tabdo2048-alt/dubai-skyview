import { Cartesian3, Math as CesiumMath } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "../src/components/map/cesium/credits.css";
import { createCesiumScene } from "../src/components/map/cesium/CesiumSceneController";
import { CesiumPhotorealisticCity } from "../src/components/map/cesium/CesiumPhotorealisticCity";
import { CesiumProjectLayer } from "../src/components/map/cesium/CesiumProjectLayer";
import { CesiumRuntimeGeodata } from "../src/components/map/cesium/CesiumRuntimeGeodata";
import { readPhotorealisticConfig } from "../src/components/map/cesium/photorealisticConfig";
import { connectProjectInteraction } from "../src/components/map/cesium/CesiumProjectInteraction";
import type { ProjectWithRelations } from "../src/lib/types";

// Vite development-only fixture. Never seeds Supabase or appears in normal routes.
if (!import.meta.env.DEV) throw new Error("This QA page is development-only");
globalThis.CESIUM_BASE_URL = "/cesium/";
const root = document.getElementById("app")!;
root.innerHTML = `<div style="height:100vh;display:flex;flex-direction:column"><header style="padding:12px;display:flex;gap:10px;flex-wrap:wrap"><b>Development QA — fictional insert, not a real development</b><select id="place" aria-label="QA location"><option>Downtown</option><option>Business Bay</option><option>Dubai Marina</option><option>Palm Jumeirah</option></select><button id="insert">Insert test GLB</button><button id="original">Original city</button><button id="far">Fly far away</button></header><div id="status" role="status" style="padding:8px">Starting…</div><div id="map" style="flex:1;min-height:0"></div><footer style="padding:8px"><div id="credits" class="keyora-cesium-credits"></div><a href="https://www.openstreetmap.org/copyright" style="color:white">© OpenStreetMap contributors (fallback)</a></footer></div>`;
const locations: Record<string, [number, number]> = {
  Downtown: [55.2744, 25.1972],
  "Business Bay": [55.265, 25.189],
  "Dubai Marina": [55.1403, 25.0805],
  "Palm Jumeirah": [55.1388, 25.1124],
};
const status = document.getElementById("status")!;
try {
  const viewer = createCesiumScene(
    document.getElementById("map")!,
    import.meta.env.VITE_CESIUM_ION_TOKEN,
    document.getElementById("credits")!,
  );
  let fallback: CesiumRuntimeGeodata | undefined;
  const layer = new CesiumProjectLayer(viewer, {
    activate: (p) => city.activate(p),
    deactivate: (id) => city.deactivate(id),
    onError: (message) => {
      status.textContent = message;
    },
  });
  const city = new CesiumPhotorealisticCity(
    viewer,
    readPhotorealisticConfig(import.meta.env, import.meta.env.VITE_CESIUM_ION_TOKEN),
    (state, message) => {
      status.textContent = `City: ${state}. ${message ?? "Inspect real geometry and textures before recording coverage as passed."}`;
      if (state === "masterplan" && !fallback) {
        fallback = new CesiumRuntimeGeodata(viewer, () => layer.getVisibleProjects());
        void fallback.start();
      }
      layer.refreshModels();
    },
  );
  const fixture = (lng: number, lat: number): ProjectWithRelations => ({
    address: null,
    bathrooms: null,
    bedrooms_max: null,
    bedrooms_min: null,
    brochure_url: null,
    category: "Residential",
    community_id: null,
    completion_date: null,
    created_at: "2026-09-11T00:00:00Z",
    description: "Fictional QA fixture",
    developer_id: null,
    featured: false,
    main_image_url: null,
    offer_accent_color: null,
    offer_header_image_url: null,
    offer_primary_color: null,
    payment_plan: null,
    plot_color: null,
    slug: "qa-fictional-development",
    starting_price_aed: null,
    status: "Off-plan",
    tags: [],
    tour_360_url: null,
    updated_at: "2026-09-11T00:00:00Z",
    video_url: null,
    developer: null,
    community: null,
    images: [],
    unit_types: [],
    payment_plans: [],
    fees: [],
    amenities: [],
    id: "qa-fictional-development",
    name: "Fictional developer-model insert",
    lng,
    lat,
    model_3d_enabled: true,
    model_3d_url: "/models/demo-district.glb",
    model_3d_lat: lat,
    model_3d_lng: lng,
    model_3d_altitude: 0,
    model_3d_rotation: 0,
    model_3d_scale: 1,
    plot_geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lng - 0.00121, lat - 0.00092],
          [lng + 0.00121, lat - 0.00092],
          [lng + 0.00121, lat + 0.00092],
          [lng - 0.00121, lat + 0.00092],
          [lng - 0.00121, lat - 0.00092],
        ],
      ],
    },
  });
  const place = document.getElementById("place") as HTMLSelectElement;
  const fly = (height = 1600) => {
    const [lng, lat] = locations[place.value];
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lng, lat - 0.008, height),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-50), roll: 0 },
      duration: 1.2,
    });
  };
  place.onchange = () => {
    layer.setProjects([]);
    fly();
  };
  document.getElementById("insert")!.onclick = () => {
    const [lng, lat] = locations[place.value];
    layer.setProjects([fixture(lng, lat)]);
    fly();
  };
  document.getElementById("original")!.onclick = () => layer.setProjects([]);
  document.getElementById("far")!.onclick = () => {
    layer.updateSelection(null, null);
    fly(14000);
  };
  const disconnect = connectProjectInteraction(
    viewer,
    (picked) => layer.resolvePick(picked),
    (pick) => layer.updateSelection(null, pick?.projectId ?? null),
    (pick) => {
      layer.updateSelection(pick?.projectId ?? null, null);
      if (pick) status.textContent = `Selected ${pick.featureName ?? pick.projectId}`;
    },
  );
  fly();
  void city.start();
  window.addEventListener(
    "pagehide",
    () => {
      disconnect();
      layer.destroy();
      city.destroy();
      fallback?.destroy();
      viewer.destroy();
    },
    { once: true },
  );
} catch {
  status.textContent =
    "WebGL initialization failed. No visual acceptance or geographic coverage can be recorded in this browser.";
}

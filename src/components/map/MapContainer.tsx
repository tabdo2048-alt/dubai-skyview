import { useState, useMemo, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Globe2,
  Satellite,
  Loader2,
  TrainFront,
  TramFront,
  Route,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  ChevronDown,
  Waves,
} from "lucide-react";
import type mapboxgl from "mapbox-gl";
import { MapboxView, type LightPreset } from "./MapboxView";
import { CloudLayer } from "./CloudLayer";
import { ProjectPopup } from "./ProjectPopup";
import { CategoryPanel } from "./CategoryPanel";
// Dev-only editor. Lazy so its static WaterLayer import (Three.js + the ~1.6 MB
// coastline) never enters the production bundle and doesn't defeat the dynamic
// WaterLayer split in MapboxView.
const WaterDebugEditor = lazy(() =>
  import("./WaterDebugEditor").then((m) => ({ default: m.WaterDebugEditor })),
);
import { shouldShowWaterDebugEditor } from "./waterDebugState";
import { ROAD_GUIDE, setRouteHighlight } from "./roadsLayer";
import { useMapConfig } from "@/hooks/use-map-config";
import { useFiltersStore } from "@/store/filters";
import { useProjects, filterProjects } from "@/hooks/use-projects";
import { usePoi, usePoiRealtime } from "@/hooks/use-pois";
import { useZones, useZonesRealtime } from "@/hooks/use-zones";
import { ZONE_ORDER, ZONE_CATEGORIES } from "@/lib/zones";
import { DUBAI_CENTER, DEFAULT_ZOOM } from "@/lib/dubai";
import { CATEGORY_COLORS } from "@/lib/metro";
import { Button } from "@/components/ui/button";

const LIGHT_PRESETS: { value: LightPreset; label: string; Icon: typeof Sun }[] = [
  { value: "dawn", label: "Dawn", Icon: Sunrise },
  { value: "day", label: "Day", Icon: Sun },
  { value: "dusk", label: "Dusk", Icon: Sunset },
  { value: "night", label: "Night", Icon: Moon },
];

// The premium guide legend — one row per line category, matching the palette
// used to draw the lines (see CATEGORY_COLORS in lib/metro).
const RAIL_GUIDE: { category: keyof typeof CATEGORY_COLORS; name: string; status: string }[] = [
  { category: "red", name: "Red Line", status: "Operational" },
  { category: "green", name: "Green Line", status: "Operational" },
  { category: "blue", name: "Blue Line", status: "2029" },
  { category: "yellow", name: "Yellow Line", status: "2030" },
  { category: "cyan", name: "Cyan Line", status: "Future" },
  { category: "pink", name: "Pink Line", status: "Future" },
  { category: "tram", name: "Dubai Tram", status: "Operational" },
];

export function MapContainer() {
  const { data: cfg, isLoading: cfgLoading } = useMapConfig();
  const { data: projects = [] } = useProjects();
  const {
    filters,
    mapMode,
    setMapMode,
    metroMode,
    setMetroMode,
    trainMode,
    setTrainMode,
    roadsMode,
    setRoadsMode,
    lightPreset,
    setLightPreset,
    selectedProjectId,
    setSelectedProjectId,
    activeCategory,
    visibleProjectIds,
    zoneCategories,
    toggleZoneCategory,
  } = useFiltersStore();
  const { data: pois = [] } = usePoi(activeCategory);
  usePoiRealtime();
  const { data: zones = [] } = useZones();
  useZonesRealtime();
  const [camera, setCamera] = useState({
    lat: DUBAI_CENTER.lat,
    lng: DUBAI_CENTER.lng,
    zoom: DEFAULT_ZOOM,
  });
  const [transitioning, setTransitioning] = useState(false);
  // Guide panel is expanded on desktop, collapsible on mobile (starts collapsed
  // under md via the `hidden md:block` body + this toggle for the mobile chevron).
  const [guideOpen, setGuideOpen] = useState(false);
  const [roadsGuideOpen, setRoadsGuideOpen] = useState(false);
  // Track when the active map instance is ready (tiles + heavy layers loaded)
  const [mapReady, setMapReady] = useState(false);
  // Dev-only: the live map for the active view, handed to the Water Debug Editor.
  // Starts from the env/localStorage gate, but the navbar button (dev builds
  // only) can flip it on/off for the rest of the session without a console command.
  const [waterEditorEnabled, setWaterEditorEnabled] = useState(() => shouldShowWaterDebugEditor());
  const [editorMap, setEditorMap] = useState<mapboxgl.Map | null>(null);

  const filtered = useMemo(() => filterProjects(projects, filters), [projects, filters]);
  // Projects start hidden; only those the user has revealed (eye toggle) draw as
  // markers. Category mode hides all project markers regardless.
  const projectsToShow = useMemo(
    () =>
      activeCategory
        ? []
        : filtered.filter((p) => visibleProjectIds.has(p.id)),
    [filtered, activeCategory, visibleProjectIds]
  );
  const selected =
    projectsToShow.find((p) => p.id === selectedProjectId) ??
    projects.find((p) => p.id === selectedProjectId) ??
    null;

  // Only the map(s) the user has actually visited get mounted. On first load
  // that's a single Mapbox GL context (half the GPU/memory of mounting both);
  // switching modes mounts the other one lazily and then keeps it alive, so
  // re-switching stays instant with no expensive map re-creation.
  const [mountedModes, setMountedModes] = useState<Set<"satellite" | "3d">>(
    () => new Set([mapMode]),
  );

  const switchMode = (mode: "satellite" | "3d") => {
    if (mode === mapMode) return;
    setMountedModes((prev) => (prev.has(mode) ? prev : new Set(prev).add(mode)));
    setTransitioning(true);
    setMapReady(false); // Show loading overlay while new map loads
    setMapMode(mode);
    setTimeout(() => setTransitioning(false), 1200);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {cfgLoading && (
        <div className="grid h-full w-full place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      )}

      {cfg && (
        <>
          {/* Flat Mapbox satellite view (satellite-streets) with metro/train + water overlay */}
          {mountedModes.has("satellite") && (
            <div
              className={
                mapMode === "satellite"
                  ? "absolute inset-0"
                  : "absolute inset-0 opacity-0 pointer-events-none"
              }
            >
              <MapboxView
                accessToken={cfg.mapboxAccessToken}
                projects={projectsToShow}
                pois={pois}
                activeCategory={activeCategory}
                zones={zones}
                zoneCategories={zoneCategories}
                camera={camera}
                onCameraChange={setCamera}
                onReady={() => mapMode === "satellite" && setMapReady(true)}
                active={mapMode === "satellite"}
                metroMode={activeCategory ? false : metroMode}
                trainMode={activeCategory ? false : trainMode}
                roadsMode={activeCategory ? false : roadsMode}
                lightPreset={lightPreset}
                mode="satellite"
              />
            </div>
          )}

          {/* 3D Mapbox view (Standard style, buildings, animated water/boats/clouds) */}
          {mountedModes.has("3d") && (
            <div
              className={
                mapMode === "3d"
                  ? "absolute inset-0"
                  : "absolute inset-0 opacity-0 pointer-events-none"
              }
            >
              <MapboxView
                accessToken={cfg.mapboxAccessToken}
                projects={projectsToShow}
                pois={pois}
                activeCategory={activeCategory}
                zones={zones}
                zoneCategories={zoneCategories}
                camera={camera}
                onCameraChange={setCamera}
                onReady={() => mapMode === "3d" && setMapReady(true)}
                onMapReady={waterEditorEnabled ? setEditorMap : undefined}
                active={mapMode === "3d"}
                metroMode={activeCategory ? false : metroMode}
                trainMode={activeCategory ? false : trainMode}
                roadsMode={activeCategory ? false : roadsMode}
                lightPreset={lightPreset}
                mode="3d"
              />
            </div>
          )}
        </>
      )}

      {/* Premium aerial cloud layer — fades out as you zoom into the city (both modes) */}
      <CloudLayer zoom={camera.zoom} />

      {/* Category filter panel (right side) */}
      <CategoryPanel />

      {/* Dev-only Water Debug Editor (3D mode) — never mounted in production. */}
      {waterEditorEnabled && mapMode === "3d" && (
        <Suspense fallback={null}>
          <WaterDebugEditor map={editorMap} />
        </Suspense>
      )}

      {/* Loading overlay — shown until the active map is ready (idle + heavy layers loaded) */}
      <AnimatePresence>
        {!mapReady && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-gradient-to-b from-emerald-deep/20 to-background/40 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-gold" />
              <p className="font-display text-sm tracking-wide text-cream">Loading Dubai...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode toggle */}
      <div className="pointer-events-auto absolute right-4 top-4 z-20 flex flex-wrap justify-end gap-1.5">
        <Button
          size="sm"
          onClick={() => switchMode("satellite")}
          className={`glass gold-hairline h-8 rounded-full px-2.5 text-xs ${mapMode === "satellite" ? "bg-gold text-gold-foreground" : "text-cream"}`}
        >
          <Satellite className="mr-1 h-3.5 w-3.5" /> Satellite
        </Button>
        <Button
          size="sm"
          onClick={() => switchMode("3d")}
          className={`glass gold-hairline h-8 rounded-full px-2.5 text-xs ${mapMode === "3d" ? "bg-gold text-gold-foreground" : "text-cream"}`}
        >
          <Globe2 className="mr-1 h-3.5 w-3.5" /> 3D View
        </Button>
        <Button
          size="sm"
          onClick={() => setMetroMode(!metroMode)}
          className={`glass gold-hairline h-8 rounded-full px-2.5 text-xs ${metroMode ? "bg-gold text-gold-foreground" : "text-cream"}`}
        >
          <TrainFront className="mr-1 h-3.5 w-3.5" /> Metro
        </Button>
        <Button
          size="sm"
          onClick={() => setTrainMode(!trainMode)}
          className={`glass gold-hairline h-8 rounded-full px-2.5 text-xs ${trainMode ? "bg-gold text-gold-foreground" : "text-cream"}`}
        >
          <TramFront className="mr-1 h-3.5 w-3.5" /> Train
        </Button>
        <Button
          size="sm"
          onClick={() => setRoadsMode(!roadsMode)}
          className={`glass gold-hairline h-8 rounded-full px-2.5 text-xs ${roadsMode ? "bg-gold text-gold-foreground" : "text-cream"}`}
        >
          <Route className="mr-1 h-3.5 w-3.5" /> Roads
        </Button>
        {/* Zone highlight toggles — RY / STR / HH investment areas. Independent;
            each lights its saved zones with its own colored border. */}
        {ZONE_ORDER.map((cat) => {
          const on = zoneCategories.has(cat);
          const { color, label } = ZONE_CATEGORIES[cat];
          return (
            <Button
              key={cat}
              size="sm"
              onClick={() => toggleZoneCategory(cat)}
              title={label}
              className={`glass gold-hairline h-8 rounded-full px-2.5 text-xs ${on ? "bg-gold text-gold-foreground" : "text-cream"}`}
            >
              <span
                className="mr-1 inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: color, boxShadow: `0 0 6px ${color}` }}
              />
              {cat}
            </Button>
          );
        })}
        {/* Dev-only: toggles the Water Debug Editor panel without a console command. */}
        {import.meta.env.DEV && (
          <Button
            size="sm"
            onClick={() => setWaterEditorEnabled((on) => !on)}
            className={`glass gold-hairline h-8 rounded-full px-2.5 text-xs ${waterEditorEnabled ? "bg-gold text-gold-foreground" : "text-cream"}`}
          >
            <Waves className="mr-1 h-3.5 w-3.5" /> Water Editor
          </Button>
        )}
      </div>

      {/* Light preset switcher — Mapbox Standard's built-in day/dawn/dusk/night */}
      {mapMode === "3d" && (
        <div className="pointer-events-auto glass gold-hairline absolute right-4 top-16 z-20 flex gap-1 rounded-full p-1">
          {LIGHT_PRESETS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              title={label}
              onClick={() => setLightPreset(value)}
              className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${
                lightPreset === value
                  ? "bg-gold text-gold-foreground"
                  : "text-cream hover:bg-white/10"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}

      {/* Bottom-left guides — Roads + Metro legends stack when both are active */}
      <div className="pointer-events-none absolute bottom-6 left-4 z-20 flex w-[230px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {/* Dubai Roads Guide — metro-style legend; hovering a row lights that
          road up on the map via the same eased glow as the cursor hover. */}
      <AnimatePresence>
        {roadsMode && (
          <motion.div
            key="roads-guide"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="pointer-events-auto"
          >
            <div className="glass gold-hairline rounded-2xl p-3.5">
              <button
                type="button"
                onClick={() => setRoadsGuideOpen((o) => !o)}
                className="flex w-full items-center gap-1.5 font-display text-sm text-cream"
              >
                <Route className="h-4 w-4 text-gold" />
                <span className="flex-1 text-left">Dubai Roads Guide</span>
                <ChevronDown
                  className={`h-4 w-4 text-cream/70 transition-transform md:hidden ${roadsGuideOpen ? "rotate-180" : ""}`}
                />
              </button>

              <div className={roadsGuideOpen ? "block" : "hidden md:block"}>
                <ul className="mt-2 space-y-0.5">
                  {ROAD_GUIDE.map((r, i) => (
                    <motion.li
                      key={r.key}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.06, duration: 0.3, ease: "easeOut" }}
                      onPointerEnter={() => setRouteHighlight(r.key, true)}
                      onPointerLeave={() => setRouteHighlight(r.key, false)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-cream/90 transition-colors hover:bg-white/10"
                    >
                      <span
                        className="h-[3px] w-6 shrink-0 rounded-full"
                        style={{
                          background: `var(${r.cssVar}, ${r.color})`,
                          boxShadow: `0 0 8px var(${r.cssVar}, ${r.color})`,
                        }}
                      />
                      <span className="flex-1 truncate">{r.name}</span>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                        style={{
                          color: `var(${r.cssVar}, ${r.color})`,
                          background: `color-mix(in srgb, var(${r.cssVar}, ${r.color}) 18%, transparent)`,
                        }}
                      >
                        {r.colorName}
                      </span>
                    </motion.li>
                  ))}
                </ul>
                <p className="mt-2.5 border-t border-white/10 pt-2 text-[10px] leading-tight text-muted-foreground">
                  Hover a road to light it up on the map. Click any road for its name.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dubai Metro Guide — premium legend, only while metro mode plays */}
      <AnimatePresence>
        {metroMode && (
          <motion.div
            key="metro-guide"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="pointer-events-auto"
          >
            <div className="glass gold-hairline rounded-2xl p-3.5">
              {/* Header — doubles as the mobile collapse toggle. */}
              <button
                type="button"
                onClick={() => setGuideOpen((o) => !o)}
                className="flex w-full items-center gap-1.5 font-display text-sm text-cream"
              >
                <TrainFront className="h-4 w-4 text-gold" />
                <span className="flex-1 text-left">Dubai Metro Guide</span>
                <ChevronDown
                  className={`h-4 w-4 text-cream/70 transition-transform md:hidden ${guideOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Body — always shown from md up; toggled by guideOpen on mobile. */}
              <div className={guideOpen ? "block" : "hidden md:block"}>
                <ul className="mt-2 space-y-1.5">
                  {RAIL_GUIDE.map((l) => (
                    <li key={l.category} className="flex items-center gap-2 text-xs text-cream/90">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: CATEGORY_COLORS[l.category],
                          boxShadow: `0 0 8px ${CATEGORY_COLORS[l.category]}`,
                        }}
                      />
                      <span className="flex-1 truncate">{l.name}</span>
                      <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-cream/70">
                        {l.status}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 border-t border-white/10 pt-2 text-[10px] leading-tight text-muted-foreground">
                  Watch the network draw itself across Dubai. Yachts &amp; ships sail the Marina,
                  Palm and Creek waters.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Cinematic overlay during transition */}
      <AnimatePresence>
        {transitioning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-gradient-to-b from-emerald-deep/70 to-background/90 backdrop-blur-md"
          >
            <div className="flex items-center gap-3 text-cream">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
              <span className="font-display text-xl tracking-wide">
                {mapMode === "3d" ? "Entering 3D Dubai" : "Returning to satellite"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ProjectPopup project={selected} onClose={() => setSelectedProjectId(null)} />
    </div>
  );
}

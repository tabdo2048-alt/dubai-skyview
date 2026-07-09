import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe2, Satellite, Loader2, TrainFront, TramFront, Sunrise, Sun, Sunset, Moon, ChevronDown } from "lucide-react";
import { MapboxView, type LightPreset } from "./MapboxView";
import { CloudLayer } from "./CloudLayer";
import { ProjectPopup } from "./ProjectPopup";
import { useMapConfig } from "@/hooks/use-map-config";
import { useFiltersStore } from "@/store/filters";
import { useProjects, filterProjects } from "@/hooks/use-projects";
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
  { category: "future", name: "Future Extensions", status: "Planned 2030" },
  { category: "train", name: "Etihad Rail", status: "Future" },
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
    lightPreset,
    setLightPreset,
    selectedProjectId,
    setSelectedProjectId,
  } = useFiltersStore();
  const [camera, setCamera] = useState({ lat: DUBAI_CENTER.lat, lng: DUBAI_CENTER.lng, zoom: DEFAULT_ZOOM });
  const [transitioning, setTransitioning] = useState(false);
  // Guide panel is expanded on desktop, collapsible on mobile (starts collapsed
  // under md via the `hidden md:block` body + this toggle for the mobile chevron).
  const [guideOpen, setGuideOpen] = useState(false);
  // Track when the active map instance is ready (tiles + heavy layers loaded)
  const [mapReady, setMapReady] = useState(false);

  const filtered = useMemo(() => filterProjects(projects, filters), [projects, filters]);
  const selected = filtered.find((p) => p.id === selectedProjectId) ?? projects.find((p) => p.id === selectedProjectId) ?? null;

  const switchMode = (mode: "satellite" | "3d") => {
    if (mode === mapMode) return;
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
          <div className={mapMode === "satellite" ? "absolute inset-0" : "absolute inset-0 opacity-0 pointer-events-none"}>
            <MapboxView
              accessToken={cfg.mapboxAccessToken}
              projects={filtered}
              camera={camera}
              onCameraChange={setCamera}
              onReady={() => mapMode === "satellite" && setMapReady(true)}
              active={mapMode === "satellite"}
              metroMode={metroMode}
              trainMode={trainMode}
              lightPreset={lightPreset}
              mode="satellite"
            />
          </div>

          {/* 3D Mapbox view (Standard style, buildings, animated water/boats/clouds) */}
          <div className={mapMode === "3d" ? "absolute inset-0" : "absolute inset-0 opacity-0 pointer-events-none"}>
            <MapboxView
              accessToken={cfg.mapboxAccessToken}
              projects={filtered}
              camera={camera}
              onCameraChange={setCamera}
              onReady={() => mapMode === "3d" && setMapReady(true)}
              active={mapMode === "3d"}
              metroMode={metroMode}
              trainMode={trainMode}
              lightPreset={lightPreset}
              mode="3d"
            />
          </div>
        </>
      )}

      {/* Premium aerial cloud layer — fades out as you zoom into the city (both modes) */}
      <CloudLayer zoom={camera.zoom} />

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
      <div className="pointer-events-auto absolute right-4 top-4 z-20 flex gap-2">
        <Button
          size="sm"
          onClick={() => switchMode("satellite")}
          className={`glass gold-hairline rounded-full px-4 ${mapMode === "satellite" ? "bg-gold text-gold-foreground" : "text-cream"}`}
        >
          <Satellite className="mr-1.5 h-4 w-4" /> Satellite
        </Button>
        <Button
          size="sm"
          onClick={() => switchMode("3d")}
          className={`glass gold-hairline rounded-full px-4 ${mapMode === "3d" ? "bg-gold text-gold-foreground" : "text-cream"}`}
        >
          <Globe2 className="mr-1.5 h-4 w-4" /> 3D View
        </Button>
        <Button
          size="sm"
          onClick={() => setMetroMode(!metroMode)}
          className={`glass gold-hairline rounded-full px-4 ${metroMode ? "bg-gold text-gold-foreground" : "text-cream"}`}
        >
          <TrainFront className="mr-1.5 h-4 w-4" /> Metro
        </Button>
        <Button
          size="sm"
          onClick={() => setTrainMode(!trainMode)}
          className={`glass gold-hairline rounded-full px-4 ${trainMode ? "bg-gold text-gold-foreground" : "text-cream"}`}
        >
          <TramFront className="mr-1.5 h-4 w-4" /> Train
        </Button>
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
                lightPreset === value ? "bg-gold text-gold-foreground" : "text-cream hover:bg-white/10"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}

      {/* Dubai Metro & Rail Guide — premium legend, only while metro mode plays */}
      <AnimatePresence>
        {mapMode === "3d" && metroMode && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="pointer-events-auto absolute bottom-6 left-4 z-20 w-[230px] max-w-[calc(100vw-2rem)]"
          >
            <div className="glass gold-hairline rounded-2xl p-3.5">
              {/* Header — doubles as the mobile collapse toggle. */}
              <button
                type="button"
                onClick={() => setGuideOpen((o) => !o)}
                className="flex w-full items-center gap-1.5 font-display text-sm text-cream"
              >
                <TrainFront className="h-4 w-4 text-gold" />
                <span className="flex-1 text-left">Dubai Metro &amp; Rail Guide</span>
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
                        style={{ background: CATEGORY_COLORS[l.category], boxShadow: `0 0 8px ${CATEGORY_COLORS[l.category]}` }}
                      />
                      <span className="flex-1 truncate">{l.name}</span>
                      <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-cream/70">
                        {l.status}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 border-t border-white/10 pt-2 text-[10px] leading-tight text-muted-foreground">
                  Watch the network draw itself across Dubai. Yachts &amp; ships sail the Marina, Palm and Creek
                  waters.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

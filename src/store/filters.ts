import { create } from "zustand";
import { emptyFilters, type ProjectFilters } from "@/lib/types";
import type { LightPreset } from "@/components/map/MapboxView";
import type { ZoneCategory } from "@/lib/zones";

type MapMode = "satellite" | "3d";

type FiltersStore = {
  filters: ProjectFilters;
  setFilters: (patch: Partial<ProjectFilters>) => void;
  reset: () => void;

  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;

  // Project the pointer is over (sidebar card OR map marker) — syncs the
  // highlight across both panes. Transient, not persisted.
  hoveredProjectId: string | null;
  setHoveredProjectId: (id: string | null) => void;

  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;

  metroMode: boolean;
  setMetroMode: (on: boolean) => void;

  trainMode: boolean;
  setTrainMode: (on: boolean) => void;

  roadsMode: boolean;
  setRoadsMode: (on: boolean) => void;

  lightPreset: LightPreset;
  setLightPreset: (preset: LightPreset) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // POI categories shown on the map. Independent toggles — schools, hospitals
  // and tourism can be on together. While any is on the map switches to a clean
  // "browse places" view (projects, metro/train/roads and zones are hidden).
  activeCategories: Set<"hospitals" | "schools" | "tourism">;
  togglePoiCategory: (cat: "hospitals" | "schools" | "tourism") => void;

  // Projects are hidden on the map by default; a project's marker only shows
  // once its id is added here (via the eye toggle in the sidebar).
  visibleProjectIds: Set<string>;
  toggleProjectVisible: (id: string) => void;

  // Project zones (plot boundaries) pinned visible on the map. While an id is
  // here its colored plot stays drawn regardless of hover/selection.
  pinnedPlotIds: Set<string>;
  togglePlotPinned: (id: string) => void;

  // Active zone-highlight categories (RY / FLIP / HH). Independent toggles — any
  // combination can be shown at once, each in its own color. Typed off
  // ZoneCategory rather than a repeated literal union so a rename can't drift.
  zoneCategories: Set<ZoneCategory>;
  toggleZoneCategory: (cat: ZoneCategory) => void;
};

export const useFiltersStore = create<FiltersStore>((set) => ({
  filters: emptyFilters,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  reset: () => set({ filters: emptyFilters }),

  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),

  hoveredProjectId: null,
  setHoveredProjectId: (id) => set({ hoveredProjectId: id }),

  mapMode: "satellite",
  setMapMode: (mode) => set({ mapMode: mode }),

  metroMode: false,
  setMetroMode: (on) => set({ metroMode: on }),

  trainMode: false,
  setTrainMode: (on) => set({ trainMode: on }),

  roadsMode: false,
  setRoadsMode: (on) => set({ roadsMode: on }),

  lightPreset: "day",
  setLightPreset: (preset) => set({ lightPreset: preset }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  activeCategories: new Set(),
  togglePoiCategory: (cat) => set((s) => {
    const next = new Set(s.activeCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    return { activeCategories: next };
  }),

  visibleProjectIds: new Set(),
  toggleProjectVisible: (id) => set((s) => {
    const next = new Set(s.visibleProjectIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { visibleProjectIds: next };
  }),

  pinnedPlotIds: new Set(),
  togglePlotPinned: (id) => set((s) => {
    const next = new Set(s.pinnedPlotIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { pinnedPlotIds: next };
  }),

  zoneCategories: new Set(),
  toggleZoneCategory: (cat) => set((s) => {
    const next = new Set(s.zoneCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    return { zoneCategories: next };
  }),
}));

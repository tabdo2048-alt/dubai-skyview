import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Bed, ChevronLeft, ChevronRight, Building2, X, Eye, EyeOff, Hexagon, Search, ArrowUpDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useProjects, filterProjects, useCommunities } from "@/hooks/use-projects";
import { useFiltersStore } from "@/store/filters";
import { formatAed, CATEGORIES, STATUSES } from "@/lib/dubai";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PRICE_RANGES: { label: string; min: number | null; max: number | null }[] = [
  { label: "< 1M", min: null, max: 1_000_000 },
  { label: "1–3M", min: 1_000_000, max: 3_000_000 },
  { label: "3–5M", min: 3_000_000, max: 5_000_000 },
  { label: "5M+", min: 5_000_000, max: null },
];
const BEDROOM_OPTIONS = [1, 2, 3, 4] as const;

export function AppSidebar() {
  const {
    filters,
    setFilters,
    reset,
    selectedProjectId,
    setSelectedProjectId,
    sidebarOpen,
    setSidebarOpen,
    visibleProjectIds,
    toggleProjectVisible,
    pinnedPlotIds,
    togglePlotPinned,
    hoveredProjectId,
    setHoveredProjectId,
  } = useFiltersStore();
  const { data: projects = [], isLoading } = useProjects();
  const { data: communities = [] } = useCommunities();
  const [sortBy, setSortBy] = useState<SortKey>("default");
  const filteredRaw = filterProjects(projects, filters);
  const filtered = useMemo(() => sortProjects(filteredRaw, sortBy), [filteredRaw, sortBy]);
  const activeChips = useMemo(() => buildActiveChips(filters, communities), [filters, communities]);
  const countDisplay = useCountUp(filtered.length);

  const toggle = <K extends "categories" | "statuses" | "communities">(key: K, value: string) => {
    const current = filters[key];
    setFilters({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] } as never);
  };

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ x: sidebarOpen ? 0 : "-100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="glass-strong absolute inset-y-0 left-0 z-30 flex w-[380px] max-w-[92vw] flex-col border-r border-border/60"
      >
        {/* Pinned header — stays put while everything below scrolls. */}
        <div className="shrink-0 border-b border-border/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Discover</div>
              <div className="font-display text-3xl leading-tight text-cream">
                {countDisplay} <span className="text-gold-gradient">projects</span>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={reset} className="text-muted-foreground hover:text-cream">
              <X className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>

          {/* Sort control. */}
          <div className="mt-3 flex items-center gap-2">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <label htmlFor="sort" className="text-[10px] uppercase tracking-widest text-muted-foreground">Sort</label>
            <select
              id="sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="glass gold-hairline ml-auto rounded-full px-3 py-1 text-xs text-cream focus:outline-none focus:ring-1 focus:ring-gold/50"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-background text-cream">{o.label}</option>
              ))}
            </select>
          </div>

          {/* Active-filter chips — click a chip to remove that filter. */}
          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {activeChips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setFilters(c.patch as never)}
                  className="glass gold-hairline flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-cream hover:text-gold"
                  title={`Remove ${c.label}`}
                >
                  {c.label} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Single scroll area: filters + project list share one gold scrollbar. */}
        <div className="sidebar-scroll flex-1 overflow-y-auto">
          <div className="border-b border-border/50 p-4">
          {/* Smart search — matches name, developer, community, address (see
              filterProjects in use-projects). */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              placeholder="Search project, developer, area…"
              className="glass gold-hairline w-full rounded-full py-2 pl-9 pr-3 text-sm text-cream placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold/50"
            />
          </div>

          <div className="mt-3 space-y-2">
            <FilterRow label="Property type">
              {CATEGORIES.map((c) => (
                <Chip key={c.value} active={filters.categories.includes(c.value)} onClick={() => toggle("categories", c.value)}>
                  {c.label}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Price (AED)">
              {PRICE_RANGES.map((r) => (
                <Chip
                  key={r.label}
                  active={filters.minPrice === r.min && filters.maxPrice === r.max}
                  onClick={() =>
                    filters.minPrice === r.min && filters.maxPrice === r.max
                      ? setFilters({ minPrice: null, maxPrice: null })
                      : setFilters({ minPrice: r.min, maxPrice: r.max })
                  }
                >
                  {r.label}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Bedrooms (min)">
              {BEDROOM_OPTIONS.map((b) => (
                <Chip
                  key={b}
                  active={filters.bedrooms === b}
                  onClick={() => setFilters({ bedrooms: filters.bedrooms === b ? null : b })}
                >
                  {b}+
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Status">
              {STATUSES.map((s) => (
                <Chip key={s.value} active={filters.statuses.includes(s.value)} onClick={() => toggle("statuses", s.value)}>
                  {s.label}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Community">
              {communities.slice(0, 12).map((c) => (
                <Chip key={c.slug} active={filters.communities.includes(c.slug)} onClick={() => toggle("communities", c.slug)}>
                  {c.name}
                </Chip>
              ))}
            </FilterRow>
          </div>
        </div>

          <div className="p-3">
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass gold-hairline flex gap-3 rounded-2xl p-2.5">
                  <div className="h-20 w-24 shrink-0 animate-pulse rounded-xl bg-muted/60" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted/60" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted/50" />
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/40" />
                    <div className="h-3 w-1/4 animate-pulse rounded bg-muted/40" />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {filtered.map((p, i) => {
              const selected = p.id === selectedProjectId;
              const hovered = p.id === hoveredProjectId;
              const visible = visibleProjectIds.has(p.id);
              const zonePinned = pinnedPlotIds.has(p.id);
              const hasPlot = !!p.plot_geometry;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: Math.min(i, 10) * 0.035, ease: [0.2, 0.9, 0.25, 1] }}
                  className="relative"
                  onMouseEnter={() => setHoveredProjectId(p.id)}
                  onMouseLeave={() => setHoveredProjectId(null)}
                >
                <button
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    track("select_project", { id: p.id, name: p.name });
                  }}
                  className={`group w-full overflow-hidden rounded-2xl text-left transition-all glass ${
                    selected
                      ? "gold-hairline ring-2 ring-gold/50"
                      : hovered
                        ? "border border-gold/40 ring-1 ring-gold/30"
                        : "border border-border/60 hover:border-gold/40"
                  }`}
                >
                  <div className="flex gap-3 p-2.5">
                    <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl">
                      {p.main_image_url ? (
                        <img src={p.main_image_url} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" decoding="async" />
                      ) : (
                        <div className="h-full w-full bg-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                        <Building2 className="h-3 w-3" /> <span className="truncate">{p.developer?.name ?? "—"}</span>
                      </div>
                      <div className="truncate font-display text-lg leading-tight text-cream">{p.name}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> <span className="truncate">{p.community?.name ?? "Dubai"}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-gold-gradient text-sm font-medium">{formatAed(p.starting_price_aed)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          <Bed className="mr-0.5 inline h-3 w-3" />
                          {p.bedrooms_min ?? "—"}
                          {p.bedrooms_max && p.bedrooms_max !== p.bedrooms_min ? `–${p.bedrooms_max}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleProjectVisible(p.id);
                  }}
                  aria-label={visible ? "Hide from map" : "Show on map"}
                  title={visible ? "Hide from map" : "Show on map"}
                  className={`glass gold-hairline absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full transition-colors ${
                    visible ? "text-gold" : "text-muted-foreground hover:text-cream"
                  }`}
                >
                  {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                {hasPlot && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlotPinned(p.id);
                    }}
                    aria-label={zonePinned ? "Hide zone" : "Show zone"}
                    title={zonePinned ? "Hide zone" : "Show zone"}
                    className={`glass gold-hairline absolute right-11 top-2 z-10 grid h-7 w-7 place-items-center rounded-full transition-colors ${
                      zonePinned ? "text-gold" : "text-muted-foreground hover:text-cream"
                    }`}
                  >
                    <Hexagon className="h-3.5 w-3.5" />
                  </button>
                )}
                </motion.div>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <div className="glass gold-hairline rounded-2xl p-6 text-center text-sm text-muted-foreground">
                No projects match your filters.
              </div>
            )}
          </div>
          </div>
        </div>
      </motion.aside>

      {/* Collapse handle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        className="glass gold-hairline absolute top-1/2 z-30 grid h-14 w-7 -translate-y-1/2 place-items-center rounded-r-2xl text-cream transition-all"
        style={{ left: sidebarOpen ? "380px" : 0 }}
      >
        {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs transition-all ${
        active ? "bg-gold text-gold-foreground shadow" : "glass gold-hairline text-cream hover:text-gold"
      }`}
    >
      {children}
    </button>
  );
}

// Animate a number from its previous value to `target` (rAF, ~500ms). Respects
// reduced-motion by snapping instantly.
function useCountUp(target: number): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === target) { setDisplay(target); fromRef.current = target; return; }
    const start = performance.now();
    const dur = 500;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return display;
}

type SortKey = "default" | "price_asc" | "price_desc" | "handover" | "name";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "Featured" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
  { value: "handover", label: "Handover" },
  { value: "name", label: "Name A–Z" },
];

// Sort a copy of the filtered list. Nullish prices/dates sort last.
function sortProjects<T extends { name: string; starting_price_aed: number | null; completion_date: string | null }>(
  list: T[],
  key: SortKey
): T[] {
  if (key === "default") return list;
  const arr = [...list];
  const num = (v: number | null) => (v == null ? Number.POSITIVE_INFINITY : v);
  const str = (v: string | null) => v ?? "￿";
  arr.sort((a, b) => {
    switch (key) {
      case "price_asc": return num(a.starting_price_aed) - num(b.starting_price_aed);
      case "price_desc": return num(b.starting_price_aed) - num(a.starting_price_aed);
      case "handover": return str(a.completion_date).localeCompare(str(b.completion_date));
      case "name": return a.name.localeCompare(b.name);
      default: return 0;
    }
  });
  return arr;
}

type Chipf = { key: string; label: string; patch: Record<string, unknown> };

// Removable chips describing every active filter. Each carries the setFilters
// patch that clears just itself.
function buildActiveChips(
  filters: {
    search: string;
    categories: string[];
    statuses: string[];
    communities: string[];
    minPrice: number | null;
    maxPrice: number | null;
    bedrooms: number | null;
  },
  communities: { slug: string; name: string }[]
): Chipf[] {
  const chips: Chipf[] = [];
  if (filters.search.trim()) chips.push({ key: "search", label: `“${filters.search.trim()}”`, patch: { search: "" } });
  for (const c of filters.categories) {
    const label = CATEGORIES.find((x) => x.value === c)?.label ?? c;
    chips.push({ key: `cat:${c}`, label, patch: { categories: filters.categories.filter((v) => v !== c) } });
  }
  for (const s of filters.statuses) {
    const label = STATUSES.find((x) => x.value === s)?.label ?? s;
    chips.push({ key: `st:${s}`, label, patch: { statuses: filters.statuses.filter((v) => v !== s) } });
  }
  for (const slug of filters.communities) {
    const label = communities.find((x) => x.slug === slug)?.name ?? slug;
    chips.push({ key: `co:${slug}`, label, patch: { communities: filters.communities.filter((v) => v !== slug) } });
  }
  if (filters.minPrice != null || filters.maxPrice != null) {
    chips.push({ key: "price", label: "Price", patch: { minPrice: null, maxPrice: null } });
  }
  if (filters.bedrooms != null) {
    chips.push({ key: "beds", label: `${filters.bedrooms}+ bd`, patch: { bedrooms: null } });
  }
  return chips;
}

export { Badge };

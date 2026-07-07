import { motion } from "framer-motion";
import { MapPin, Bed, ChevronLeft, ChevronRight, Building2, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useProjects, filterProjects, useCommunities } from "@/hooks/use-projects";
import { useFiltersStore } from "@/store/filters";
import { formatAed, CATEGORIES, STATUSES } from "@/lib/dubai";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AppSidebar() {
  const { filters, setFilters, reset, selectedProjectId, setSelectedProjectId, sidebarOpen, setSidebarOpen } =
    useFiltersStore();
  const { data: projects = [], isLoading } = useProjects();
  const { data: communities = [] } = useCommunities();
  const filtered = filterProjects(projects, filters);

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
        <div className="border-b border-border/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Discover</div>
              <div className="font-display text-2xl leading-tight text-cream">
                {filtered.length} <span className="text-gold-gradient">projects</span>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={reset} className="text-muted-foreground hover:text-cream">
              <X className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            <FilterRow label="Category">
              {CATEGORIES.map((c) => (
                <Chip key={c.value} active={filters.categories.includes(c.value)} onClick={() => toggle("categories", c.value)}>
                  {c.label}
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

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Loading Dubai projects…</div>}
          <div className="space-y-2">
            {filtered.map((p) => {
              const selected = p.id === selectedProjectId;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`group w-full overflow-hidden rounded-2xl text-left transition-all ${
                    selected ? "gold-hairline ring-2 ring-gold/50" : "border border-border/60 hover:border-gold/40"
                  } glass`}
                >
                  <div className="flex gap-3 p-2.5">
                    <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl">
                      {p.main_image_url ? (
                        <img src={p.main_image_url} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
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
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <div className="glass gold-hairline rounded-2xl p-6 text-center text-sm text-muted-foreground">
                No projects match your filters.
              </div>
            )}
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

export { Badge };

import { motion } from "framer-motion";
import { Hospital, GraduationCap, Camera } from "lucide-react";
import { useFiltersStore } from "@/store/filters";
import { POI_TABLES } from "@/hooks/use-pois";
import { track } from "@/lib/analytics";

const CATEGORIES = [
  { id: "hospitals", icon: Hospital, label: "Hospitals" },
  { id: "schools", icon: GraduationCap, label: "Schools" },
  { id: "tourism", icon: Camera, label: "Tourism" },
] as const;

export function CategoryPanel() {
  const { activeCategories, togglePoiCategory } = useFiltersStore();

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="pointer-events-auto absolute right-4 top-32 z-20"
    >
      <div className="flex flex-col gap-2">
        {CATEGORIES.map(({ id, icon: Icon, label }) => {
          const isActive = activeCategories.has(id);
          const color = POI_TABLES[id].color; // category hue for the active glass glow
          return (
            <motion.button
              key={id}
              title={label}
              onClick={() => {
                togglePoiCategory(id);
                if (!isActive) track("open_poi_category", { category: id });
              }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              // Active state is liquid glass with a category-colour ring + glow
              // (no more gold fill). Inactive stays the plain gold-hairline glass.
              className={`flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl transition-all ${
                isActive ? "glass" : "glass gold-hairline text-cream hover:text-gold"
              }`}
              style={
                isActive
                  ? {
                      color,
                      boxShadow: `0 0 0 1.5px ${color}, 0 6px 20px ${color}55, inset 0 0 12px ${color}22`,
                    }
                  : undefined
              }
            >
              <Icon className="h-4 w-4" />
              <span className="text-[7px] font-semibold uppercase tracking-wider leading-none">
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Colour legend for the map dots — only the active categories. */}
      {activeCategories.size > 0 && (
        <div className="pointer-events-none mt-2 flex flex-col gap-1 rounded-lg bg-black/45 px-2.5 py-2 backdrop-blur-sm">
          {CATEGORIES.filter(({ id }) => activeCategories.has(id)).map(({ id, label }) => (
            <div key={id} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-white/80"
                style={{ background: POI_TABLES[id].color }}
              />
              <span className="text-[9px] font-semibold uppercase tracking-wider text-cream">
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

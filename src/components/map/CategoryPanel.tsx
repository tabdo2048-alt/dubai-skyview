import { motion } from "framer-motion";
import { Hospital, GraduationCap, Palmtree } from "lucide-react";
import { useFiltersStore } from "@/store/filters";
import { POI_TABLES } from "@/hooks/use-pois";
import { track } from "@/lib/analytics";

const CATEGORIES = [
  { id: "hospitals", icon: Hospital, label: "Hospitals" },
  { id: "schools", icon: GraduationCap, label: "Schools" },
  { id: "tourism", icon: Palmtree, label: "Tourism" },
] as const;

export function CategoryPanel() {
  const { activeCategory, setActiveCategory } = useFiltersStore();

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
          const isActive = activeCategory === id;
          return (
            <motion.button
              key={id}
              title={label}
              onClick={() => {
                setActiveCategory(isActive ? null : (id as never));
                if (!isActive) track("open_poi_category", { category: id });
              }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className={`flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl transition-all ${
                isActive
                  ? "bg-gold text-gold-foreground shadow-lg shadow-gold/30"
                  : "glass gold-hairline text-cream hover:text-gold"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[7px] font-semibold uppercase tracking-wider leading-none">
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

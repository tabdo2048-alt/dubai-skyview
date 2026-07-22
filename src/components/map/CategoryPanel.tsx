import { motion } from "framer-motion";
import { Hospital, GraduationCap, Palmtree } from "lucide-react";
import { useFiltersStore } from "@/store/filters";
import { POI_TABLES } from "@/hooks/use-pois";

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
      <div className="glass gold-hairline flex flex-col gap-2 rounded-2xl p-3">
        {CATEGORIES.map(({ id, icon: Icon, label }) => {
          const isActive = activeCategory === id;
          return (
            <motion.button
              key={id}
              onClick={() =>
                setActiveCategory(isActive ? null : (id as never))
              }
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`flex flex-col items-center gap-1 rounded-xl p-3 transition-all ${
                isActive
                  ? "bg-gold text-gold-foreground shadow-lg"
                  : "text-cream hover:bg-white/10"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold uppercase tracking-widest">
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

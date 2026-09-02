import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Layers, TrainFront, TramFront, Route, Waves, ChevronDown, type LucideIcon } from "lucide-react";
import { useFiltersStore } from "@/store/filters";
import { ZONE_ORDER, ZONE_CATEGORIES } from "@/lib/zones";

type Props = {
  /** Metro is a subscriber-only layer on the public map. */
  canUseMetro?: boolean;
  // Dev-only Water Debug Editor toggle, threaded from MapContainer (local state).
  showWaterEditor?: boolean;
  waterEditor?: boolean;
  onToggleWaterEditor?: () => void;
};

// A single toggle row inside the menu: icon (or colour dot) + label + on-state.
function ToggleRow({
  label,
  on,
  onClick,
  Icon,
  dotColor,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  Icon?: LucideIcon;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
        on ? "bg-gold/90 text-gold-foreground" : "text-cream hover:bg-white/10"
      }`}
    >
      {dotColor ? (
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ background: dotColor, boxShadow: on ? "none" : `0 0 6px ${dotColor}` }}
        />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      ) : null}
      <span className="flex-1 font-medium">{label}</span>
      <span
        className={`grid h-4 w-7 place-items-center rounded-full text-[8px] font-bold uppercase ${
          on ? "bg-gold-foreground/20" : "bg-white/10 text-cream/60"
        }`}
      >
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}

/**
 * Consolidated map layers menu: one button that opens a grouped panel of overlay
 * toggles (Transit, Investment Zones, and a dev-only Water Editor), replacing the
 * long row of individual top-bar pills. Reads/writes the filters store directly;
 * the Satellite/3D view switch stays outside as its own primary control.
 */
export function LayersMenu({ canUseMetro = false, showWaterEditor, waterEditor, onToggleWaterEditor }: Props) {
  const {
    metroMode,
    setMetroMode,
    trainMode,
    setTrainMode,
    roadsMode,
    setRoadsMode,
    zoneCategories,
    toggleZoneCategory,
  } = useFiltersStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount =
    (canUseMetro && metroMode ? 1 : 0) + (trainMode ? 1 : 0) + (roadsMode ? 1 : 0) + zoneCategories.size;

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="glass gold-hairline flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-cream"
      >
        <Layers className="h-3.5 w-3.5" />
        Layers
        {activeCount > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-gold-foreground">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="glass gold-hairline absolute right-0 top-10 z-30 w-56 rounded-2xl p-2"
          >
            <div className="px-2 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-cream/55">
              Transit
            </div>
            {canUseMetro && (
              <ToggleRow label="Metro" Icon={TrainFront} on={metroMode} onClick={() => setMetroMode(!metroMode)} />
            )}
            <ToggleRow label="Train" Icon={TramFront} on={trainMode} onClick={() => setTrainMode(!trainMode)} />
            <ToggleRow label="Roads" Icon={Route} on={roadsMode} onClick={() => setRoadsMode(!roadsMode)} />

            <div className="px-2 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wider text-cream/55">
              Investment Zones
            </div>
            {ZONE_ORDER.map((cat) => {
              const { color, label } = ZONE_CATEGORIES[cat];
              return (
                <ToggleRow
                  key={cat}
                  label={label}
                  dotColor={color}
                  on={zoneCategories.has(cat)}
                  onClick={() => toggleZoneCategory(cat)}
                />
              );
            })}

            {showWaterEditor && onToggleWaterEditor && (
              <>
                <div className="px-2 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wider text-cream/55">
                  Dev
                </div>
                <ToggleRow
                  label="Water Editor"
                  Icon={Waves}
                  on={!!waterEditor}
                  onClick={onToggleWaterEditor}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, MapPinned } from "lucide-react";
import { EMIRATE_VIEWS, type EmirateKey, type EmirateView } from "@/lib/dubai";

type Props = {
  activeKey: EmirateKey;
  onSelect: (view: EmirateView) => void;
};

/** Compact map control for moving between the emirates covered by the map. */
export function EmiratesMenu({ activeKey, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="glass gold-hairline flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-cream"
      >
        <MapPinned className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Emirates</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            role="menu"
            aria-label="Choose an emirate"
            className="glass gold-hairline absolute right-0 top-10 z-30 w-52 rounded-2xl p-2"
          >
            <div className="px-2 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-cream/55">
              Choose emirate
            </div>
            {Object.values(EMIRATE_VIEWS).map((view) => {
              const selected = view.key === activeKey;
              return (
                <button
                  key={view.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelect(view);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selected ? "bg-gold/90 text-gold-foreground" : "text-cream hover:bg-white/10"
                  }`}
                >
                  <MapPinned className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 font-medium">{view.label}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

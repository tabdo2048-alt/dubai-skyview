import { useEffect, useRef, useState } from "react";
import { Building, ChevronDown, X } from "lucide-react";
import type { TourFloorRow, TourSceneRow } from "./types";

interface TourElevatorProps {
  floors: TourFloorRow[];
  scenes: TourSceneRow[];
  currentFloorId: string | null;
  onSelectFloor: (floorId: string) => void;
  onNavigate: (sceneId: string) => void;
}

export function TourElevator({
  floors,
  scenes,
  currentFloorId,
  onSelectFloor,
  onNavigate,
}: TourElevatorProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  if (floors.length < 2) return null;

  const currentFloor = floors.find((floor) => floor.id === currentFloorId) ?? null;

  return (
    <div className="absolute left-3 top-36 z-40 lg:left-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-black/70 px-3 text-xs font-medium text-cream shadow-xl backdrop-blur-xl hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        aria-expanded={open}
        aria-controls="tour-elevator-panel"
      >
        <Building className="size-4 text-gold" aria-hidden="true" />
        <span>{currentFloor?.name ?? "Elevator"}</span>
        <ChevronDown className="size-3" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id="tour-elevator-panel"
          className="mt-2 max-h-[min(55vh,30rem)] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0e12]/95 p-2 text-cream shadow-2xl backdrop-blur-xl"
          role="dialog"
          aria-label="اختر الطابق والمشهد"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-gold">Elevator</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-9 place-items-center rounded-lg hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              aria-label="إغلاق المصعد"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          {floors.map((floor) => {
            const floorScenes = scenes.filter(
              (scene) => scene.is_published && scene.floor_id === floor.id,
            );
            const current = floor.id === currentFloorId;
            return (
              <section key={floor.id} className="mt-1 rounded-xl border border-white/8 p-2">
                <button
                  type="button"
                  onClick={() => onSelectFloor(floor.id)}
                  className={`w-full rounded-lg px-2 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                    current ? "bg-gold/15 text-gold" : "hover:bg-white/5"
                  }`}
                  aria-current={current ? "location" : undefined}
                >
                  {floor.name}
                </button>
                {floorScenes.length > 0 && (
                  <div className="mt-1 grid gap-1 pl-2">
                    {floorScenes.map((floorScene) => (
                      <button
                        key={floorScene.id}
                        type="button"
                        onClick={() => {
                          onNavigate(floorScene.id);
                          setOpen(false);
                        }}
                        className="min-h-10 rounded-lg px-2 text-left text-xs text-cream/70 hover:bg-white/5 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                      >
                        {floorScene.name}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

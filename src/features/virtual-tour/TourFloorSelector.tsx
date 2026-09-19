import type { TourFloorRow } from "./types";

interface TourFloorSelectorProps {
  floors: TourFloorRow[];
  selectedFloorId: string | null;
  currentFloorId: string | null;
  onSelect: (floorId: string) => void;
}

export function TourFloorSelector({
  floors,
  selectedFloorId,
  currentFloorId,
  onSelect,
}: TourFloorSelectorProps) {
  if (floors.length === 0) return null;

  return (
    <div
      className="flex max-w-[calc(100vw-1.5rem)] gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/65 p-1.5 shadow-xl backdrop-blur-xl lg:max-w-[min(54vw,42rem)]"
      role="group"
      aria-label="اختر الطابق"
    >
      {floors.map((floor) => {
        const selected = floor.id === selectedFloorId;
        const current = floor.id === currentFloorId;
        return (
          <button
            key={floor.id}
            type="button"
            onClick={() => onSelect(floor.id)}
            aria-pressed={selected}
            aria-current={current ? "location" : undefined}
            className={
              "min-h-10 shrink-0 rounded-xl px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold sm:text-sm " +
              (selected
                ? "bg-gold text-gold-foreground shadow-lg"
                : "text-cream/85 hover:bg-white/10 hover:text-white")
            }
          >
            {floor.name}
            {current && !selected ? <span className="sr-only"> (الطابق الحالي)</span> : null}
          </button>
        );
      })}
    </div>
  );
}

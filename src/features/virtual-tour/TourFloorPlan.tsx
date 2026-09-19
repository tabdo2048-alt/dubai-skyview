import { useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { floorPlanPositionPercent } from "./floorData";
import type { TourFloorRow, TourSceneRow } from "./types";

interface TourFloorPlanProps {
  floor: TourFloorRow;
  scenes: TourSceneRow[];
  currentSceneId: string;
  imageUrl: string | null;
  imageLoading: boolean;
  imageError: boolean;
  expanded: boolean;
  onNavigate: (sceneId: string) => void;
  onToggleExpanded: () => void;
  onClose: () => void;
}

export function TourFloorPlan({
  floor,
  scenes,
  currentSceneId,
  imageUrl,
  imageLoading,
  imageError,
  expanded,
  onNavigate,
  onToggleExpanded,
  onClose,
}: TourFloorPlanProps) {
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const storedRatio =
    floor.width && floor.height && floor.width > 0 && floor.height > 0
      ? floor.width / floor.height
      : null;
  const aspectRatio = naturalRatio ?? storedRatio ?? 1.5;
  const showError = imageError || loadFailed;
  const markers = scenes
    .map((scene) => ({ scene, position: floorPlanPositionPercent(scene) }))
    .filter(
      (item): item is { scene: TourSceneRow; position: { left: string; top: string } } =>
        item.position !== null,
    );

  return (
    <section
      className={
        "overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e13]/95 shadow-2xl backdrop-blur-xl transition-[width] " +
        (expanded ? "w-[min(92vw,48rem)]" : "w-[min(88vw,24rem)]")
      }
      aria-label={`مخطط ${floor.name}`}
    >
      <header className="flex min-h-12 items-center gap-2 border-b border-white/10 px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-cream">{floor.name}</p>
          <p className="text-[11px] text-cream/55">اختر غرفة للانتقال إليها</p>
        </div>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="grid size-10 place-items-center rounded-full text-cream/75 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          aria-label={expanded ? "تصغير مخطط الطابق" : "تكبير مخطط الطابق"}
        >
          {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="grid size-10 place-items-center rounded-full text-cream/75 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          aria-label="إغلاق مخطط الطابق"
        >
          <X className="size-4" />
        </button>
      </header>

      {!floor.floor_plan_url ? (
        <div className="grid min-h-40 place-items-center px-5 text-center text-sm text-cream/65">
          لا يوجد مخطط متاح لهذا الطابق
        </div>
      ) : showError ? (
        <div
          role="status"
          className="grid min-h-40 place-items-center px-5 text-center text-sm text-cream/65"
        >
          تعذر تحميل مخطط الطابق
        </div>
      ) : (
        <div className="max-h-[52vh] overflow-auto p-3">
          <div
            className="relative mx-auto w-full overflow-hidden rounded-xl bg-white/5"
            style={{ aspectRatio }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`مخطط ${floor.name}`}
                className="absolute inset-0 size-full"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setNaturalRatio(image.naturalWidth / image.naturalHeight);
                  }
                  setLoaded(true);
                }}
                onError={() => setLoadFailed(true)}
              />
            ) : null}
            {(imageLoading || !loaded) && (
              <div
                className="absolute inset-0 grid place-items-center bg-white/5 text-xs text-cream/55"
                role="status"
              >
                جاري تحميل مخطط الطابق…
              </div>
            )}
            {loaded &&
              markers.map(({ scene, position }) => {
                const current = scene.id === currentSceneId;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => onNavigate(scene.id)}
                    disabled={current}
                    aria-current={current ? "location" : undefined}
                    aria-label={current ? `${scene.name}، موقعك الحالي` : `انتقل إلى ${scene.name}`}
                    title={scene.name}
                    className="group absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    style={position}
                  >
                    <span
                      className={
                        "block size-4 rounded-full border-2 shadow-[0_2px_10px_rgba(0,0,0,0.65)] transition group-hover:scale-125 " +
                        (current
                          ? "border-white bg-gold ring-4 ring-gold/30"
                          : "border-gold bg-[#11151b]")
                      }
                    />
                    <span className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block group-focus-visible:block sm:block sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                      {scene.name}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
}

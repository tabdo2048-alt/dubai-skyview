import { Check, Loader2, MapPin, Move, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NormalizedFloorPoint } from "../floorData";
import type { TourSceneRow } from "../types";

export type MarkerSaveState = "saved" | "unsaved" | "saving" | "error";

interface AdminFloorPlanScenePanelProps {
  scenes: TourSceneRow[];
  selectedScene: TourSceneRow | null;
  draftPoint: NormalizedFloorPoint | null;
  saveState: MarkerSaveState;
  placeMode: boolean;
  canPlace: boolean;
  onSelectScene: (sceneId: string) => void;
  onTogglePlaceMode: () => void;
  onSave: () => void;
  onClear: () => void;
}

export function AdminFloorPlanScenePanel({
  scenes,
  selectedScene,
  draftPoint,
  saveState,
  placeMode,
  canPlace,
  onSelectScene,
  onTogglePlaceMode,
  onSave,
  onClear,
}: AdminFloorPlanScenePanelProps) {
  return (
    <aside className="glass gold-hairline self-start rounded-2xl p-4 xl:sticky xl:top-20">
      <h2 className="font-display text-xl text-cream">Scenes</h2>
      <p className="mt-1 text-xs text-muted-foreground">مشاهد هذا الطابق فقط.</p>
      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
        {scenes.length === 0 ? (
          <p className="rounded-xl bg-white/5 p-4 text-sm text-muted-foreground">
            لا توجد مشاهد مرتبطة بهذا الطابق.
          </p>
        ) : (
          scenes.map((scene, index) => {
            const positioned = scene.floor_plan_x !== null && scene.floor_plan_y !== null;
            const selected = scene.id === selectedScene?.id;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => onSelectScene(scene.id)}
                aria-pressed={selected}
                className={
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold " +
                  (selected
                    ? "border-gold/70 bg-gold/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")
                }
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs text-cream">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-cream">{scene.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {positioned ? "Positioned" : "Not positioned"}
                  </span>
                </span>
                <Badge variant={scene.is_published ? "default" : "secondary"}>
                  {scene.is_published ? "Published" : "Draft"}
                </Badge>
              </button>
            );
          })
        )}
      </div>

      {selectedScene ? (
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-cream">{selectedScene.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {draftPoint
                  ? `x ${draftPoint.x.toFixed(4)} · y ${draftPoint.y.toFixed(4)}`
                  : "No position"}
              </p>
            </div>
            <span
              className="flex items-center gap-1 text-[11px] text-muted-foreground"
              aria-live="polite"
            >
              {saveState === "saving" ? <Loader2 className="size-3 animate-spin" /> : null}
              {saveState === "saved" ? <Check className="size-3 text-emerald-400" /> : null}
              {saveState === "unsaved" ? "Unsaved" : null}
              {saveState === "saving" ? "Saving" : null}
              {saveState === "saved" ? "Saved" : null}
              {saveState === "error" ? "Error" : null}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <Button
              type="button"
              variant={placeMode ? "default" : "outline"}
              onClick={onTogglePlaceMode}
              disabled={!canPlace}
            >
              {draftPoint ? <Move className="mr-1 size-4" /> : <MapPin className="mr-1 size-4" />}
              {placeMode ? "اضغط داخل المخطط" : draftPoint ? "Reposition" : "Place on Floor Plan"}
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={!draftPoint || saveState === "saved" || saveState === "saving"}
              className="bg-gold text-gold-foreground"
            >
              <Save className="mr-1 size-4" /> Save Position
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onClear}
              disabled={!draftPoint || saveState === "saving"}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1 size-4" /> Remove from Floor Plan
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

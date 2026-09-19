import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Eye, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ProjectWithRelations } from "@/lib/types";
import {
  clientPointToNormalized,
  hasFloorPlanPosition,
  normalizedPointToPercent,
  scenesForFloor,
  type NormalizedFloorPoint,
} from "../floorData";
import { resolveFloorPlanUrl } from "../floorPlanUrl";
import type { TourFloorRow, TourSceneRow, VirtualTourRow } from "../types";
import {
  clearFloorScenePositions,
  updateFloorPlan,
  updateSceneFloorPosition,
  useAdminFloorEditor,
  useCanManageTourProject,
} from "./adminQueries";
import {
  newFloorPlanPath,
  removeReplacedTourImage,
  uploadTourImage,
  type UploadState,
} from "./adminStorage";
import { validateAdminImageFile, type AdminImageValidation } from "./adminValidation";
import { AdminFloorPlanScenePanel, type MarkerSaveState } from "./AdminFloorPlanScenePanel";

interface AdminFloorPlanEditorProps {
  project: ProjectWithRelations;
  tourId: string;
  floorId: string;
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
}

interface ReplacementDraft {
  file: File;
  validation: AdminImageValidation;
}

interface FloorPlanWorkspaceProps {
  project: ProjectWithRelations;
  tour: VirtualTourRow;
  floor: TourFloorRow;
  scenes: TourSceneRow[];
  selectedScene: TourSceneRow | null;
  onSelectScene: (sceneId: string) => void;
}

function scenePoint(scene: TourSceneRow): NormalizedFloorPoint | null {
  return hasFloorPlanPosition(scene) ? { x: scene.floor_plan_x, y: scene.floor_plan_y } : null;
}

function FloorPlanWorkspace({
  project,
  tour,
  floor,
  scenes,
  selectedScene,
  onSelectScene,
}: FloorPlanWorkspaceProps) {
  const queryClient = useQueryClient();
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const dragPointerId = useRef<number | null>(null);
  const [draftPoint, setDraftPoint] = useState<NormalizedFloorPoint | null>(() =>
    selectedScene ? scenePoint(selectedScene) : null,
  );
  const [saveState, setSaveState] = useState<MarkerSaveState>("saved");
  const [placeMode, setPlaceMode] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [replacement, setReplacement] = useState<ReplacementDraft | null>(null);
  const positionedSceneCount = scenes.filter(hasFloorPlanPosition).length;
  const storedRatio =
    floor.width && floor.height && floor.width > 0 && floor.height > 0
      ? floor.width / floor.height
      : null;
  const aspectRatio = naturalRatio ?? storedRatio ?? 1.5;

  const floorPlanQuery = useQuery({
    queryKey: ["virtual-tour", "floor-plan", floor.id, floor.floor_plan_url],
    queryFn: () => resolveFloorPlanUrl(floor.floor_plan_url),
    enabled: Boolean(floor.floor_plan_url),
    staleTime: 50 * 60_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          "virtual-tour-admin",
          "projects",
          project.id,
          "tours",
          tour.id,
          "floors",
          floor.id,
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: ["virtual-tour-admin", "projects", project.id, "tours", tour.id],
      }),
      queryClient.invalidateQueries({ queryKey: ["virtual-tour", "floor-plan", floor.id] }),
    ]);
  };

  const pointFromClient = (clientX: number, clientY: number) => {
    const element = imageWrapperRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return clientPointToNormalized(clientX, clientY, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  };

  const placeAt = (clientX: number, clientY: number) => {
    if (!selectedScene || !imageLoaded) return;
    const point = pointFromClient(clientX, clientY);
    if (!point) return;
    setDraftPoint(point);
    setSaveState("unsaved");
    setPlaceMode(false);
  };

  const savePosition = async () => {
    if (!selectedScene || !draftPoint) return;
    setSaveState("saving");
    try {
      await updateSceneFloorPosition(tour.id, floor.id, selectedScene.id, draftPoint);
      setSaveState("saved");
      await refresh();
      toast.success("تم حفظ موقع المشهد على المخطط.");
    } catch {
      setSaveState("error");
      toast.error("تعذر حفظ الموقع. ما زال التغيير غير محفوظ.");
    }
  };

  const clearPosition = async () => {
    if (!selectedScene) return;
    setSaveState("saving");
    try {
      await updateSceneFloorPosition(tour.id, floor.id, selectedScene.id, null);
      setDraftPoint(null);
      setSaveState("saved");
      setPlaceMode(false);
      await refresh();
      toast.success("تمت إزالة المشهد من المخطط دون حذف المشهد.");
    } catch {
      setSaveState("error");
      toast.error("تعذر إزالة موقع المشهد.");
    }
  };

  const uploadReplacement = async (draft: ReplacementDraft, clearPositions: boolean) => {
    setReplacement(null);
    setUploadState("uploading");
    const nextPath = newFloorPlanPath(
      {
        tenantId: tour.tenant_id,
        projectId: project.id,
        tourId: tour.id,
        floorId: floor.id,
      },
      draft.file,
    );
    let uploaded = false;
    let databaseUpdated = false;
    try {
      const uploadedPath = await uploadTourImage("floorPlans", nextPath, draft.file);
      uploaded = true;
      setUploadState("processing");
      await updateFloorPlan(tour.id, floor.id, {
        floor_plan_url: uploadedPath,
        width: draft.validation.width,
        height: draft.validation.height,
      });
      databaseUpdated = true;
      if (clearPositions) await clearFloorScenePositions(tour.id, floor.id);
      await removeReplacedTourImage("floorPlans", floor.floor_plan_url);
      await refresh();
      setUploadState("ready");
      toast.success(
        clearPositions
          ? "تم استبدال المخطط ومسح مواقع المشاهد."
          : "تم رفع مخطط الطابق مع الاحتفاظ بالمواقع.",
      );
    } catch {
      if (databaseUpdated && clearPositions) {
        let rolledBack = false;
        try {
          await updateFloorPlan(tour.id, floor.id, {
            floor_plan_url: floor.floor_plan_url,
            width: floor.width,
            height: floor.height,
          });
          rolledBack = true;
        } catch {
          /* Preserve the new valid plan if rollback is rejected by RLS. */
        }
        if (rolledBack) await removeReplacedTourImage("floorPlans", nextPath);
      }
      if (uploaded && !databaseUpdated) await removeReplacedTourImage("floorPlans", nextPath);
      setUploadState("failed");
      toast.error("تعذر تحديث مخطط الطابق. لم يتم حذف المخطط السابق.");
    }
  };

  const prepareUpload = async (file: File) => {
    setUploadState("validating");
    const validation = await validateAdminImageFile(file, "floorPlan");
    if (!validation.valid) {
      setUploadState("failed");
      return toast.error(validation.errors[0]);
    }
    const draft = { file, validation };
    if (floor.floor_plan_url && positionedSceneCount > 0) {
      setReplacement(draft);
      setUploadState("idle");
      return;
    }
    await uploadReplacement(draft, false);
  };

  const markerPoint = (scene: TourSceneRow) =>
    scene.id === selectedScene?.id ? draftPoint : scenePoint(scene);

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, scene: TourSceneRow) => {
    if (scene.id !== selectedScene?.id || !markerPoint(scene)) return;
    event.stopPropagation();
    dragPointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragPointerId.current !== event.pointerId) return;
    event.preventDefault();
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    setDraftPoint(point);
    setSaveState("unsaved");
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragPointerId.current !== event.pointerId) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragPointerId.current = null;
  };

  const imageBusy = floorPlanQuery.isLoading || (floorPlanQuery.data && !imageLoaded);
  const publicPreviewScene =
    selectedScene?.is_published && tour.is_published
      ? selectedScene
      : (scenes.find((scene) => scene.is_published) ?? null);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <section className="glass gold-hairline overflow-hidden rounded-2xl" aria-label="محرر المخطط">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <h1 className="font-display text-2xl text-cream">{floor.name}</h1>
            <p className="text-xs text-muted-foreground">
              0,0 أعلى اليسار — اسحب العلامة أو اختر وضعها ثم اضغط داخل الصورة.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" disabled={uploadState === "uploading"}>
              <label className="cursor-pointer">
                {uploadState === "validating" || uploadState === "uploading" ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <ImagePlus className="mr-1 size-4" />
                )}
                {floor.floor_plan_url ? "استبدال المخطط" : "رفع مخطط"}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadState === "uploading" || uploadState === "processing"}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void prepareUpload(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </Button>
            {publicPreviewScene ? (
              <Button asChild variant="outline">
                <Link
                  to="/projects/$slug/tour/$tourId/scene/$sceneId"
                  params={{
                    slug: project.slug,
                    tourId: tour.id,
                    sceneId: publicPreviewScene.id,
                  }}
                  target="_blank"
                >
                  <Eye className="mr-1 size-4" /> Preview Floor Plan
                </Link>
              </Button>
            ) : null}
          </div>
        </header>

        {!floor.floor_plan_url ? (
          <div className="grid min-h-[28rem] place-items-center p-6 text-center">
            <div>
              <ImagePlus className="mx-auto mb-3 size-10 text-gold" />
              <p className="text-cream">لا يوجد Floor Plan لهذا الطابق.</p>
              <p className="mt-1 text-sm text-muted-foreground">ارفع JPEG أو PNG أو WebP للبدء.</p>
            </div>
          </div>
        ) : floorPlanQuery.isError || imageFailed ? (
          <div className="grid min-h-[28rem] place-items-center p-6 text-center text-cream">
            تعذر تحميل مخطط الطابق. يمكنك استبداله من زر الرفع.
          </div>
        ) : (
          <div className="overflow-auto p-4 sm:p-6">
            <div
              ref={imageWrapperRef}
              className={
                "relative mx-auto w-full max-w-6xl overflow-hidden rounded-xl bg-white/5 shadow-2xl " +
                (placeMode ? "cursor-crosshair ring-2 ring-gold" : "")
              }
              style={{ aspectRatio }}
              onClick={(event) => {
                if (placeMode) placeAt(event.clientX, event.clientY);
              }}
            >
              {floorPlanQuery.data ? (
                <img
                  src={floorPlanQuery.data}
                  alt={`مخطط ${floor.name}`}
                  draggable={false}
                  className="absolute inset-0 size-full select-none"
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                      setNaturalRatio(image.naturalWidth / image.naturalHeight);
                    }
                    setImageLoaded(true);
                  }}
                  onError={() => setImageFailed(true)}
                />
              ) : null}
              {imageBusy ? (
                <div
                  className="absolute inset-0 grid place-items-center bg-black/30 text-sm text-cream"
                  role="status"
                >
                  <Loader2 className="mr-2 inline size-5 animate-spin" /> جاري تحميل المخطط…
                </div>
              ) : null}
              {imageLoaded
                ? scenes.map((scene, index) => {
                    const point = markerPoint(scene);
                    if (!point) return null;
                    const selected = scene.id === selectedScene?.id;
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectScene(scene.id);
                        }}
                        onPointerDown={(event) => startDrag(event, scene)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        aria-label={`${selected ? "المشهد المحدد" : "تحديد"} ${scene.name}${selected ? "، اسحب لتغيير الموقع" : ""}`}
                        aria-current={selected ? "location" : undefined}
                        title={scene.name}
                        className={
                          "group absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold " +
                          (selected ? "z-20 touch-none" : "z-10")
                        }
                        style={normalizedPointToPercent(point)}
                      >
                        <span
                          className={
                            "grid size-7 place-items-center rounded-full border-2 text-[11px] font-bold shadow-lg transition " +
                            (selected
                              ? "scale-110 border-white bg-gold text-black ring-4 ring-gold/30"
                              : "border-gold bg-[#11151b] text-gold group-hover:scale-110")
                          }
                        >
                          {index + 1}
                        </span>
                        <span className="pointer-events-none absolute bottom-full mb-1 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                          {scene.name}
                        </span>
                      </button>
                    );
                  })
                : null}
            </div>
          </div>
        )}
      </section>

      <AdminFloorPlanScenePanel
        scenes={scenes}
        selectedScene={selectedScene}
        draftPoint={draftPoint}
        saveState={saveState}
        placeMode={placeMode}
        canPlace={Boolean(floor.floor_plan_url && imageLoaded)}
        onSelectScene={onSelectScene}
        onTogglePlaceMode={() => setPlaceMode((value) => !value)}
        onSave={() => void savePosition()}
        onClear={() => void clearPosition()}
      />

      <AlertDialog
        open={Boolean(replacement)}
        onOpenChange={(open) => !open && setReplacement(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-400" /> استبدال Floor Plan
            </AlertDialogTitle>
            <AlertDialogDescription>
              تغيير المخطط قد يجعل مواقع {positionedSceneCount} من المشاهد الحالية غير دقيقة. اختر
              الاحتفاظ بالمواقع أو مسحها بعد نجاح رفع المخطط الجديد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-wrap">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => replacement && void uploadReplacement(replacement, false)}
            >
              Keep existing markers
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => replacement && void uploadReplacement(replacement, true)}
            >
              Clear all positions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AdminFloorPlanEditor({
  project,
  tourId,
  floorId,
  selectedSceneId,
  onSelectScene,
}: AdminFloorPlanEditorProps) {
  const editorQuery = useAdminFloorEditor(project.id, tourId, floorId);
  const accessQuery = useCanManageTourProject(project.tenant_id);
  if (editorQuery.isLoading || accessQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> جاري تحميل محرر المخطط…
      </div>
    );
  }
  if (accessQuery.isError || !accessQuery.data) {
    return (
      <div className="rounded-2xl border border-destructive/30 p-6 text-cream">
        ليس لديك صلاحية إدارة هذا المخطط.
      </div>
    );
  }
  if (editorQuery.isError || !editorQuery.data) {
    return (
      <div className="rounded-2xl border border-destructive/30 p-6 text-cream">
        الطابق غير موجود داخل هذه الجولة أو لا يمكنك الوصول إليه.
      </div>
    );
  }

  const { tour, floor } = editorQuery.data;
  const scenes = scenesForFloor(tour.id, floor.id, editorQuery.data.scenes);
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0] ?? null;
  return (
    <div className="grid gap-5">
      <Button asChild variant="ghost" className="w-fit">
        <Link to="/admin/projects/$id/tours/$tourId" params={{ id: project.id, tourId }}>
          <ArrowLeft className="mr-1 size-4" /> Back to Tour Editor
        </Link>
      </Button>
      <FloorPlanWorkspace
        key={`${floor.id}:${floor.updated_at}:${selectedScene?.id ?? "empty"}`}
        project={project}
        tour={tour}
        floor={floor}
        scenes={scenes}
        selectedScene={selectedScene}
        onSelectScene={onSelectScene}
      />
    </div>
  );
}

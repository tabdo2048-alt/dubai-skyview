import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { safeHttpUrl } from "@/lib/utils";
import type { ProjectWithRelations } from "@/lib/types";
import { resolveTourScope, tourScopeIds } from "../hierarchy";
import type { TourSceneRow, TourScope } from "../types";
import { AdminFloorManager } from "./AdminFloorManager";
import { AdminSceneEditor } from "./AdminSceneEditor";
import { AdminSceneListItem } from "./AdminSceneListItem";
import {
  createScene,
  deleteScene,
  updateScene,
  updateTour,
  useAdminTour,
  useCanManageTourProject,
} from "./adminQueries";
import {
  newPanoramaPath,
  newThumbnailPath,
  uploadTourImage,
  type UploadState,
} from "./adminStorage";
import { validateAdminImageFile, validateTourForPublish } from "./adminValidation";

interface AdminTourEditorProps {
  project: ProjectWithRelations;
  tourId: string;
  selectedSceneId: string | null;
  preview: boolean;
  onSelectScene: (sceneId: string | null, preview?: boolean) => void;
}

export function AdminTourEditor({
  project,
  tourId,
  selectedSceneId,
  preview,
  onSelectScene,
}: AdminTourEditorProps) {
  const queryClient = useQueryClient();
  const bundleQuery = useAdminTour(project.id, tourId);
  const accessQuery = useCanManageTourProject(project.tenant_id);
  const [creatingScene, setCreatingScene] = useState(false);
  const [sceneName, setSceneName] = useState("");
  const [sceneDescription, setSceneDescription] = useState("");
  const [sceneFloorId, setSceneFloorId] = useState("");
  const [scenePublished, setScenePublished] = useState(true);
  const [panoramaFile, setPanoramaFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [savingTour, setSavingTour] = useState(false);
  const [editScope, setEditScope] = useState<TourScope | null>(null);
  const [deleteSceneId, setDeleteSceneId] = useState<string | null>(null);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["virtual-tour-admin", "projects", project.id, "tours", tourId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["virtual-tour-admin", "projects", project.id, "tours"],
      }),
    ]);
  };

  if (bundleQuery.isLoading || accessQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> جاري تحميل محرر الجولة…
      </div>
    );
  }
  if (accessQuery.isError || !accessQuery.data)
    return (
      <div className="rounded-2xl border border-destructive/30 p-6 text-cream">
        ليس لديك صلاحية إدارة هذه الجولة.
      </div>
    );
  if (bundleQuery.isError || !bundleQuery.data)
    return (
      <div className="rounded-2xl border border-destructive/30 p-6 text-cream">
        الجولة غير موجودة أو لا يمكنك الوصول إليها.
      </div>
    );

  const bundle = bundleQuery.data;
  const tourScope = editScope ?? resolveTourScope(bundle.tour);
  const selectedScene =
    bundle.scenes.find((scene) => scene.id === selectedSceneId) ?? bundle.scenes[0] ?? null;
  const hotspotCounts = new Map<string, number>();
  for (const hotspot of bundle.hotspots) {
    hotspotCounts.set(hotspot.scene_id, (hotspotCounts.get(hotspot.scene_id) ?? 0) + 1);
  }
  const floorNames = new Map(bundle.floors.map((floor) => [floor.id, floor.name]));

  const saveTourSettings = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const thumbnailValue = String(values.get("thumbnail") ?? "").trim();
    if (!name) return toast.error("اسم الجولة مطلوب.");
    if (thumbnailValue && !safeHttpUrl(thumbnailValue))
      return toast.error("رابط Thumbnail غير صالح.");
    const publish = values.get("published") === "on";
    const scope = String(values.get("scope") ?? "project") as TourScope;
    const unitId = String(values.get("unitId") ?? "") || null;
    const selectedUnit = bundle.units.find((unit) => unit.id === unitId);
    const scopeIds = tourScopeIds(scope, {
      buildingId:
        scope === "unit"
          ? (selectedUnit?.building_id ?? null)
          : String(values.get("buildingId") ?? "") || null,
      unitId,
    });
    if (scope === "building" && !scopeIds.building_id) return toast.error("اختر البرج.");
    if (scope === "unit" && !scopeIds.unit_id) return toast.error("اختر الوحدة.");
    if (publish) {
      const errors = validateTourForPublish(bundle.scenes, bundle.hotspots);
      if (errors.length) return toast.error(errors[0]);
    }
    setSavingTour(true);
    try {
      await updateTour(bundle.tour.id, {
        name,
        description: String(values.get("description") ?? "").trim() || null,
        thumbnail_url: thumbnailValue || null,
        ...scopeIds,
        is_published: publish,
      });
      await refresh();
      toast.success("تم حفظ إعدادات الجولة.");
    } catch {
      toast.error("تعذر حفظ إعدادات الجولة.");
    } finally {
      setSavingTour(false);
    }
  };

  const addScene = async () => {
    if (!sceneName.trim()) return toast.error("اسم المشهد مطلوب.");
    if (!panoramaFile) return toast.error("اختر صورة Panorama أولًا.");
    setUploadState("validating");
    const [panoramaValidation, thumbnailValidation] = await Promise.all([
      validateAdminImageFile(panoramaFile, "panorama"),
      thumbnailFile ? validateAdminImageFile(thumbnailFile, "thumbnail") : null,
    ]);
    if (!panoramaValidation.valid) {
      setUploadState("failed");
      return toast.error(panoramaValidation.errors[0]);
    }
    if (thumbnailValidation && !thumbnailValidation.valid) {
      setUploadState("failed");
      return toast.error(thumbnailValidation.errors[0]);
    }
    if (panoramaValidation.warnings[0]) toast.warning(panoramaValidation.warnings[0]);

    const sceneId = crypto.randomUUID();
    const panoramaPath = newPanoramaPath(
      {
        tenantId: bundle.tour.tenant_id,
        projectId: project.id,
        tourId: bundle.tour.id,
        sceneId,
      },
      panoramaFile,
    );
    setUploadState("uploading");
    let created: TourSceneRow | null = null;
    let panoramaUploaded = false;
    try {
      created = await createScene({
        id: sceneId,
        tour_id: bundle.tour.id,
        floor_id: sceneFloorId || null,
        name: sceneName.trim(),
        description: sceneDescription.trim() || null,
        panorama_url: panoramaPath,
        initial_yaw: 0,
        initial_pitch: 0,
        initial_hfov: 100,
        sort_order: bundle.scenes.length,
        is_published: scenePublished,
      });
      await uploadTourImage("panoramas", panoramaPath, panoramaFile);
      panoramaUploaded = true;
      if (thumbnailFile) {
        const thumbnailPath = newThumbnailPath(
          {
            tenantId: bundle.tour.tenant_id,
            projectId: project.id,
            tourId: bundle.tour.id,
            sceneId,
          },
          thumbnailFile,
        );
        try {
          await uploadTourImage("thumbnails", thumbnailPath, thumbnailFile);
          await updateScene(sceneId, { thumbnail_url: thumbnailPath });
        } catch {
          toast.warning("تم إنشاء المشهد، لكن تعذر رفع Thumbnail.");
        }
      }
      setUploadState("processing");
      await refresh();
      setUploadState("ready");
      setCreatingScene(false);
      setSceneName("");
      setSceneDescription("");
      setSceneFloorId("");
      setPanoramaFile(null);
      setThumbnailFile(null);
      onSelectScene(sceneId);
      toast.success("تم إنشاء المشهد ورفع Panorama.");
    } catch {
      if (created && !panoramaUploaded) {
        try {
          await deleteScene(created.id);
        } catch {
          /* RLS-safe best effort cleanup */
        }
      }
      setUploadState("failed");
      toast.error(
        panoramaUploaded
          ? "تم رفع Panorama، لكن تعذر تحديث الواجهة. أعد تحميل الصفحة."
          : "تعذر إنشاء المشهد أو رفع Panorama. لم يتم نشر بيانات ناقصة.",
      );
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link to="/admin/projects/$id/tours" params={{ id: project.id }}>
            <ArrowLeft className="mr-1 size-4" /> Tours
          </Link>
        </Button>
        {bundle.tour.is_published && bundle.scenes.length > 0 && (
          <Button asChild variant="outline">
            <Link
              to="/projects/$slug/tour/$tourId"
              params={{ slug: project.slug, tourId: bundle.tour.id }}
              target="_blank"
            >
              <Eye className="mr-1 size-4" /> Public Preview
            </Link>
          </Button>
        )}
      </div>

      <form
        key={bundle.tour.updated_at}
        onSubmit={(event) => {
          event.preventDefault();
          void saveTourSettings(event.currentTarget);
        }}
        className="glass gold-hairline grid gap-3 rounded-2xl p-5 md:grid-cols-2"
      >
        <h1 className="font-display text-2xl text-cream md:col-span-2">{bundle.tour.name}</h1>
        <label className="grid gap-1 text-xs text-cream">
          Tour Name
          <Input name="name" defaultValue={bundle.tour.name} />
        </label>
        <label className="grid gap-1 text-xs text-cream">
          Tour Scope
          <select
            name="scope"
            value={tourScope}
            onChange={(event) => setEditScope(event.target.value as TourScope)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="project">Project Tour</option>
            <option value="building" disabled={bundle.buildings.length === 0}>
              Building Tour
            </option>
            <option value="unit">Unit Tour</option>
          </select>
        </label>
        {tourScope === "building" && (
          <label className="grid gap-1 text-xs text-cream">
            Building
            <select
              name="buildingId"
              defaultValue={bundle.tour.building_id ?? ""}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select building</option>
              {bundle.buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {tourScope === "unit" && (
          <label className="grid gap-1 text-xs text-cream">
            Unit
            <select
              name="unitId"
              defaultValue={bundle.tour.unit_id ?? ""}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select unit</option>
              {bundle.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-xs text-cream md:col-span-2">
          Description
          <Textarea name="description" defaultValue={bundle.tour.description ?? ""} />
        </label>
        <label className="grid gap-1 text-xs text-cream md:col-span-2">
          Thumbnail URL
          <Input
            name="thumbnail"
            defaultValue={bundle.tour.thumbnail_url ?? ""}
            placeholder="https://…"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-cream">
          <input name="published" type="checkbox" defaultChecked={bundle.tour.is_published} />{" "}
          Published
        </label>
        <div className="md:text-right">
          <Button type="submit" disabled={savingTour} className="bg-gold text-gold-foreground">
            {savingTour && <Loader2 className="mr-1 size-4 animate-spin" />} Save Tour
          </Button>
        </div>
      </form>

      <AdminFloorManager tour={bundle.tour} floors={bundle.floors} onChanged={refresh} />

      <section className="glass gold-hairline rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-cream">Scenes</h2>
            <p className="text-xs text-muted-foreground">يتم تحميل Panorama للمشهد المحدد فقط.</p>
          </div>
          <Button onClick={() => setCreatingScene((value) => !value)}>
            <Plus className="mr-1 size-4" /> Add Scene
          </Button>
        </div>
        {creatingScene && (
          <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 p-4 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-cream">
              Name
              <Input value={sceneName} onChange={(event) => setSceneName(event.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-cream">
              Floor
              <select
                value={sceneFloorId}
                onChange={(event) => setSceneFloorId(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">No Floor</option>
                {bundle.floors.map((floor) => (
                  <option key={floor.id} value={floor.id}>
                    {floor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-cream md:col-span-2">
              Description
              <Textarea
                value={sceneDescription}
                onChange={(event) => setSceneDescription(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs text-cream">
              Panorama 360
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setPanoramaFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="grid gap-1 text-xs text-cream">
              Thumbnail — optional
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setThumbnailFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-cream">
              <input
                type="checkbox"
                checked={scenePublished}
                onChange={(event) => setScenePublished(event.target.checked)}
              />{" "}
              Scene published
            </label>
            <div className="flex gap-2 md:justify-end">
              <Button
                disabled={
                  uploadState === "validating" ||
                  uploadState === "uploading" ||
                  uploadState === "processing"
                }
                onClick={() => void addScene()}
                className="bg-gold text-gold-foreground"
              >
                <Upload className="mr-1 size-4" />
                {uploadState === "validating"
                  ? "Validating…"
                  : uploadState === "uploading"
                    ? "Uploading…"
                    : uploadState === "processing"
                      ? "Processing…"
                      : "Create Scene"}
              </Button>
              <Button variant="outline" onClick={() => setCreatingScene(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {bundle.scenes.length === 0 && (
            <p className="rounded-xl bg-white/5 p-4 text-sm text-muted-foreground">
              لا توجد Scenes بعد.
            </p>
          )}
          {bundle.scenes.map((scene) => {
            const current = scene.id === selectedScene?.id;
            const hotspotCount = hotspotCounts.get(scene.id) ?? 0;
            const floorName = scene.floor_id ? (floorNames.get(scene.floor_id) ?? null) : null;
            return (
              <AdminSceneListItem
                key={scene.id}
                scene={scene}
                floorName={floorName}
                hotspotCount={hotspotCount}
                current={current}
                onSelect={() => onSelectScene(scene.id)}
                onDelete={() => setDeleteSceneId(scene.id)}
              />
            );
          })}
        </div>
      </section>

      {selectedScene && (
        <AdminSceneEditor
          key={`${selectedScene.id}:${preview}`}
          bundle={bundle}
          scene={selectedScene}
          onChanged={refresh}
          onSelectScene={(sceneId) => onSelectScene(sceneId, preview)}
          initialPreview={preview}
        />
      )}

      <AlertDialog
        open={Boolean(deleteSceneId)}
        onOpenChange={(open) => !open && setDeleteSceneId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المشهد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف Hotspots المصدرية، وأي Navigation يشير للمشهد سيصبح بدون Target.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (!deleteSceneId) return;
                void deleteScene(deleteSceneId)
                  .then(refresh)
                  .then(() => {
                    if (selectedSceneId === deleteSceneId) onSelectScene(null);
                    toast.success("تم حذف المشهد.");
                  })
                  .catch(() => toast.error("تعذر حذف المشهد."))
                  .finally(() => setDeleteSceneId(null));
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

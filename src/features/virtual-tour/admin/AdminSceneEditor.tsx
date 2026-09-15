import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, ImageUp, Loader2, Plus, Save } from "lucide-react";
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
import { hotspotExternalUrl } from "../hotspotData";
import { resolvePanoramaUrl } from "../panoramaUrl";
import type { TourHotspotRow, TourSceneRow } from "../types";
import { AdminHotspotForm } from "./AdminHotspotForm";
import {
  createHotspot,
  deleteHotspot,
  updateHotspot,
  updateScene,
  type AdminTourBundle,
} from "./adminQueries";
import {
  newPanoramaPath,
  newThumbnailPath,
  removeReplacedTourImage,
  uploadTourImage,
  type UploadState,
} from "./adminStorage";
import { validateAdminImageFile, validateCameraValues, type HotspotDraft } from "./adminValidation";
import { AdminPanoramaEditor, type AdminPanoramaEditorHandle } from "./AdminPanoramaEditor";

interface AdminSceneEditorProps {
  bundle: AdminTourBundle;
  scene: TourSceneRow;
  onChanged: () => Promise<void>;
  onSelectScene: (sceneId: string) => void;
  initialPreview?: boolean;
}

type PlacementMode = "idle" | "add" | { repositionId: string };

export function AdminSceneEditor({
  bundle,
  scene,
  onChanged,
  onSelectScene,
  initialPreview = false,
}: AdminSceneEditorProps) {
  const editorRef = useRef<AdminPanoramaEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [previewMode, setPreviewMode] = useState(initialPreview);
  const [placementMode, setPlacementMode] = useState<PlacementMode>("idle");
  const [pendingPlacement, setPendingPlacement] = useState<{ yaw: number; pitch: number } | null>(
    null,
  );
  const [selectedHotspot, setSelectedHotspot] = useState<TourHotspotRow | null>(null);
  const [deleteHotspotId, setDeleteHotspotId] = useState<string | null>(null);
  const panoramaQuery = useQuery({
    queryKey: ["virtual-tour-admin", "scene", scene.id, "panorama", scene.panorama_url],
    queryFn: () => resolvePanoramaUrl(scene.panorama_url),
    staleTime: 50 * 60 * 1000,
  });
  const hotspots = useMemo(
    () => bundle.hotspots.filter((hotspot) => hotspot.scene_id === scene.id),
    [bundle.hotspots, scene.id],
  );

  const saveScene = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    if (!name) return toast.error("اسم المشهد مطلوب.");
    const yaw = Number(values.get("yaw"));
    const pitch = Number(values.get("pitch"));
    const hfov = Number(values.get("hfov"));
    const cameraErrors = validateCameraValues(yaw, pitch, hfov);
    if (cameraErrors.length) return toast.error(cameraErrors[0]);
    setSaving(true);
    try {
      await updateScene(scene.id, {
        name,
        description: String(values.get("description") ?? "").trim() || null,
        floor_id: String(values.get("floorId") ?? "") || null,
        initial_yaw: yaw,
        initial_pitch: pitch,
        initial_hfov: hfov,
        sort_order: Math.max(0, Number(values.get("sortOrder")) || 0),
        is_published: values.get("published") === "on",
      });
      await onChanged();
      toast.success("تم حفظ المشهد.");
    } catch {
      toast.error("تعذر حفظ المشهد.");
    } finally {
      setSaving(false);
    }
  };

  const setCurrentCamera = async () => {
    const camera = editorRef.current?.getCamera();
    if (!camera) return toast.error("المعاينة غير جاهزة بعد.");
    setSaving(true);
    try {
      await updateScene(scene.id, {
        initial_yaw: camera.yaw,
        initial_pitch: camera.pitch,
        initial_hfov: camera.hfov,
      });
      await onChanged();
      toast.success("تم حفظ زاوية البداية الحالية.");
    } catch {
      toast.error("تعذر حفظ زاوية البداية.");
    } finally {
      setSaving(false);
    }
  };

  const replacePanorama = async (file: File) => {
    setUploadState("validating");
    const validation = await validateAdminImageFile(file, "panorama");
    if (!validation.valid) {
      setUploadState("failed");
      return toast.error(validation.errors[0]);
    }
    if (validation.warnings[0]) toast.warning(validation.warnings[0]);
    setUploadState("uploading");
    try {
      const path = newPanoramaPath(
        {
          tenantId: bundle.tour.tenant_id,
          projectId: bundle.tour.project_id,
          tourId: bundle.tour.id,
          sceneId: scene.id,
        },
        file,
      );
      const uploadedPath = await uploadTourImage("panoramas", path, file);
      setUploadState("processing");
      await updateScene(scene.id, { panorama_url: uploadedPath });
      await removeReplacedTourImage("panoramas", scene.panorama_url);
      await onChanged();
      setUploadState("ready");
      toast.success("تم استبدال Panorama.");
    } catch {
      setUploadState("failed");
      toast.error("تعذر استبدال Panorama. الملف السابق لم يتغير.");
    }
  };

  const replaceThumbnail = async (file: File) => {
    setUploadState("validating");
    const validation = await validateAdminImageFile(file, "thumbnail");
    if (!validation.valid) {
      setUploadState("failed");
      return toast.error(validation.errors[0]);
    }
    setUploadState("uploading");
    try {
      const path = newThumbnailPath(
        {
          tenantId: bundle.tour.tenant_id,
          projectId: bundle.tour.project_id,
          tourId: bundle.tour.id,
          sceneId: scene.id,
        },
        file,
      );
      const uploadedPath = await uploadTourImage("thumbnails", path, file);
      setUploadState("processing");
      await updateScene(scene.id, { thumbnail_url: uploadedPath });
      await removeReplacedTourImage("thumbnails", scene.thumbnail_url);
      await onChanged();
      setUploadState("ready");
      toast.success("تم حفظ Thumbnail.");
    } catch {
      setUploadState("failed");
      toast.error("تعذر استبدال Thumbnail.");
    }
  };

  const activateHotspot = (hotspot: TourHotspotRow) => {
    if (!previewMode) {
      setSelectedHotspot(hotspot);
      setPendingPlacement({ yaw: hotspot.yaw, pitch: hotspot.pitch });
      setPlacementMode("idle");
      return;
    }
    if (hotspot.type === "navigation" && hotspot.target_scene_id) {
      onSelectScene(hotspot.target_scene_id);
      return;
    }
    if (hotspot.type === "external_link") {
      const url = hotspotExternalUrl(hotspot.metadata);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    toast.info(hotspot.label ?? hotspot.type);
  };

  const handlePlace = async (placement: { yaw: number; pitch: number }) => {
    if (typeof placementMode === "object") {
      setSaving(true);
      try {
        await updateHotspot(placementMode.repositionId, placement);
        await onChanged();
        setPlacementMode("idle");
        setPendingPlacement(null);
        setSelectedHotspot(null);
        toast.success("تم تغيير موضع Hotspot.");
      } catch {
        toast.error("تعذر تغيير الموضع.");
      } finally {
        setSaving(false);
      }
      return;
    }
    setPendingPlacement(placement);
    setSelectedHotspot(null);
    setPlacementMode("idle");
  };

  const saveHotspot = async (draft: HotspotDraft, metadata: Record<string, string>) => {
    setSaving(true);
    try {
      const values = {
        scene_id: scene.id,
        target_scene_id: draft.type === "navigation" ? draft.targetSceneId : null,
        type: draft.type,
        label: draft.label.trim() || null,
        yaw: draft.yaw,
        pitch: draft.pitch,
        metadata,
      };
      if (selectedHotspot) await updateHotspot(selectedHotspot.id, values);
      else await createHotspot(values);
      await onChanged();
      setPendingPlacement(null);
      setSelectedHotspot(null);
      toast.success(selectedHotspot ? "تم تحديث Hotspot." : "تم إنشاء Hotspot.");
    } catch {
      toast.error("تعذر حفظ Hotspot.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-h-[32rem]">
        {panoramaQuery.isLoading ? (
          <div className="grid h-[32rem] place-items-center rounded-2xl bg-black/30 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : panoramaQuery.isError || !panoramaQuery.data ? (
          <div className="grid h-[32rem] place-items-center rounded-2xl border border-destructive/30 text-sm text-cream">
            تعذر تحميل Panorama. يمكنك استبدالها من الإعدادات.
          </div>
        ) : (
          <AdminPanoramaEditor
            ref={editorRef}
            scene={scene}
            panoramaUrl={panoramaQuery.data}
            hotspots={hotspots}
            placementMode={placementMode !== "idle"}
            pendingPlacement={pendingPlacement}
            onPlace={(placement) => void handlePlace(placement)}
            onSelectHotspot={activateHotspot}
          />
        )}
      </div>

      <aside className="grid content-start gap-4">
        <div
          className="flex rounded-xl border border-white/10 p-1"
          role="group"
          aria-label="وضع المحرر"
        >
          <Button
            size="sm"
            variant={!previewMode ? "default" : "ghost"}
            className="flex-1"
            onClick={() => setPreviewMode(false)}
          >
            Edit Mode
          </Button>
          <Button
            size="sm"
            variant={previewMode ? "default" : "ghost"}
            className="flex-1"
            onClick={() => {
              setPreviewMode(true);
              setPlacementMode("idle");
              setPendingPlacement(null);
              setSelectedHotspot(null);
            }}
          >
            Preview Mode
          </Button>
        </div>

        {!previewMode && !pendingPlacement && !selectedHotspot && (
          <Button className="bg-gold text-gold-foreground" onClick={() => setPlacementMode("add")}>
            <Plus className="mr-1 size-4" /> Add Hotspot
          </Button>
        )}
        {!previewMode && (pendingPlacement || selectedHotspot) && (
          <AdminHotspotForm
            key={`${selectedHotspot?.id ?? "new"}:${pendingPlacement?.yaw ?? 0}:${pendingPlacement?.pitch ?? 0}`}
            scene={scene}
            scenes={bundle.scenes}
            units={bundle.units}
            hotspot={selectedHotspot}
            placement={
              pendingPlacement ?? {
                yaw: selectedHotspot?.yaw ?? 0,
                pitch: selectedHotspot?.pitch ?? 0,
              }
            }
            saving={saving}
            onSave={saveHotspot}
            onCancel={() => {
              setPendingPlacement(null);
              setSelectedHotspot(null);
              setPlacementMode("idle");
            }}
            onDelete={selectedHotspot ? () => setDeleteHotspotId(selectedHotspot.id) : undefined}
            onReposition={
              selectedHotspot
                ? () => {
                    setPendingPlacement(null);
                    setPlacementMode({ repositionId: selectedHotspot.id });
                  }
                : undefined
            }
          />
        )}
        {!previewMode && placementMode !== "idle" && !pendingPlacement && (
          <Button variant="outline" onClick={() => setPlacementMode("idle")}>
            <Crosshair className="mr-1 size-4" /> إلغاء تحديد المكان
          </Button>
        )}

        <form
          key={scene.updated_at}
          onSubmit={(event) => {
            event.preventDefault();
            void saveScene(event.currentTarget);
          }}
          className="grid gap-3 rounded-2xl border border-white/10 p-4"
        >
          <h3 className="font-display text-lg text-cream">Scene Settings</h3>
          <label className="grid gap-1 text-xs text-cream">
            Name
            <Input name="name" defaultValue={scene.name} maxLength={120} />
          </label>
          <label className="grid gap-1 text-xs text-cream">
            Description
            <Textarea name="description" defaultValue={scene.description ?? ""} />
          </label>
          <label className="grid gap-1 text-xs text-cream">
            Floor
            <select
              name="floorId"
              defaultValue={scene.floor_id ?? ""}
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
          <div className="grid grid-cols-3 gap-2">
            <label className="grid gap-1 text-[11px] text-cream">
              Yaw
              <Input name="yaw" type="number" step="0.01" defaultValue={scene.initial_yaw} />
            </label>
            <label className="grid gap-1 text-[11px] text-cream">
              Pitch
              <Input name="pitch" type="number" step="0.01" defaultValue={scene.initial_pitch} />
            </label>
            <label className="grid gap-1 text-[11px] text-cream">
              HFOV
              <Input
                name="hfov"
                type="number"
                step="0.01"
                defaultValue={scene.initial_hfov ?? 100}
              />
            </label>
          </div>
          <label className="grid gap-1 text-xs text-cream">
            Sort order
            <Input name="sortOrder" type="number" min={0} defaultValue={scene.sort_order} />
          </label>
          <label className="flex items-center gap-2 text-xs text-cream">
            <input name="published" type="checkbox" defaultChecked={scene.is_published} /> Scene
            published
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => void setCurrentCamera()}
          >
            <Crosshair className="mr-1 size-4" /> Set current view as initial
          </Button>
          <Button type="submit" disabled={saving} className="bg-gold text-gold-foreground">
            <Save className="mr-1 size-4" /> Save Scene
          </Button>
          <Button asChild type="button" variant="outline">
            <label className="cursor-pointer">
              <ImageUp className="mr-1 size-4" />
              {uploadState === "uploading" || uploadState === "processing"
                ? "Uploading…"
                : "Replace Panorama"}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadState === "uploading"}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void replacePanorama(file);
                  event.target.value = "";
                }}
              />
            </label>
          </Button>
          <Button asChild type="button" variant="outline">
            <label className="cursor-pointer">
              <ImageUp className="mr-1 size-4" />
              {scene.thumbnail_url ? "Replace Thumbnail" : "Add Thumbnail"}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadState === "uploading"}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void replaceThumbnail(file);
                  event.target.value = "";
                }}
              />
            </label>
          </Button>
        </form>
      </aside>

      <AlertDialog
        open={Boolean(deleteHotspotId)}
        onOpenChange={(open) => !open && setDeleteHotspotId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف Hotspot؟</AlertDialogTitle>
            <AlertDialogDescription>
              ستختفي النقطة فورًا من المعاينة والجولة العامة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (!deleteHotspotId) return;
                void deleteHotspot(deleteHotspotId)
                  .then(onChanged)
                  .then(() => {
                    setSelectedHotspot(null);
                    setPendingPlacement(null);
                    toast.success("تم حذف Hotspot.");
                  })
                  .catch(() => toast.error("تعذر حذف Hotspot."))
                  .finally(() => setDeleteHotspotId(null));
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

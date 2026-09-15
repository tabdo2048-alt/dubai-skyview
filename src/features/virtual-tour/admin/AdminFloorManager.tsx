import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, MapPinned, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { TourFloorRow, VirtualTourRow } from "../types";
import { createFloor, deleteFloor, updateFloor } from "./adminQueries";
import {
  newFloorPlanPath,
  removeReplacedTourImage,
  uploadTourImage,
  type UploadState,
} from "./adminStorage";
import { validateAdminImageFile } from "./adminValidation";

interface AdminFloorManagerProps {
  tour: VirtualTourRow;
  floors: TourFloorRow[];
  onChanged: () => Promise<void>;
}

export function AdminFloorManager({ tour, floors, onChanged }: AdminFloorManagerProps) {
  const [name, setName] = useState("");
  const [floorNumber, setFloorNumber] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const addFloor = async () => {
    if (!name.trim()) return toast.error("اسم الطابق مطلوب.");
    setSavingId("new");
    try {
      await createFloor({
        tour_id: tour.id,
        name: name.trim(),
        floor_number: floorNumber === "" ? null : Number(floorNumber),
        sort_order: floors.length,
      });
      setName("");
      setFloorNumber("");
      await onChanged();
      toast.success("تمت إضافة الطابق.");
    } catch {
      toast.error("تعذر إضافة الطابق.");
    } finally {
      setSavingId(null);
    }
  };

  const saveFloor = async (floor: TourFloorRow, form: HTMLFormElement) => {
    const values = new FormData(form);
    const nextName = String(values.get("name") ?? "").trim();
    if (!nextName) return toast.error("اسم الطابق مطلوب.");
    const numberValue = String(values.get("floorNumber") ?? "");
    const orderValue = Number(values.get("sortOrder") ?? floor.sort_order);
    setSavingId(floor.id);
    try {
      await updateFloor(floor.id, {
        name: nextName,
        floor_number: numberValue === "" ? null : Number(numberValue),
        sort_order: Number.isInteger(orderValue) && orderValue >= 0 ? orderValue : floor.sort_order,
      });
      await onChanged();
      toast.success("تم حفظ الطابق.");
    } catch {
      toast.error("تعذر حفظ الطابق.");
    } finally {
      setSavingId(null);
    }
  };

  const uploadFloorPlan = async (floor: TourFloorRow, file: File) => {
    setUploadState((current) => ({ ...current, [floor.id]: "validating" }));
    const validation = await validateAdminImageFile(file, "floorPlan");
    if (!validation.valid) {
      setUploadState((current) => ({ ...current, [floor.id]: "failed" }));
      return toast.error(validation.errors[0]);
    }
    setUploadState((current) => ({ ...current, [floor.id]: "uploading" }));
    try {
      const path = newFloorPlanPath(
        {
          tenantId: tour.tenant_id,
          projectId: tour.project_id,
          tourId: tour.id,
          floorId: floor.id,
        },
        file,
      );
      const uploadedPath = await uploadTourImage("floorPlans", path, file);
      setUploadState((current) => ({ ...current, [floor.id]: "processing" }));
      await updateFloor(floor.id, {
        floor_plan_url: uploadedPath,
        width: validation.width,
        height: validation.height,
      });
      await removeReplacedTourImage("floorPlans", floor.floor_plan_url);
      await onChanged();
      setUploadState((current) => ({ ...current, [floor.id]: "ready" }));
      toast.success("تم رفع مخطط الطابق.");
    } catch {
      setUploadState((current) => ({ ...current, [floor.id]: "failed" }));
      toast.error("تعذر رفع مخطط الطابق.");
    }
  };

  return (
    <section className="glass gold-hairline rounded-2xl p-5" aria-labelledby="floor-manager-title">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="floor-manager-title" className="font-display text-xl text-cream">
            Floors
          </h2>
          <p className="text-xs text-muted-foreground">
            إدارة الطوابق ورفع المخططات وتحديد مواقع المشاهد بصريًا.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ground Floor"
          aria-label="اسم الطابق الجديد"
        />
        <Input
          value={floorNumber}
          onChange={(event) => setFloorNumber(event.target.value)}
          type="number"
          placeholder="رقم"
          aria-label="رقم الطابق"
        />
        <Button onClick={() => void addFloor()} disabled={savingId === "new"}>
          <Plus className="mr-1 size-4" /> إضافة
        </Button>
      </div>
      <div className="mt-4 grid gap-3">
        {floors.length === 0 && (
          <p className="rounded-xl bg-white/5 p-4 text-sm text-muted-foreground">
            لا توجد طوابق بعد.
          </p>
        )}
        {floors.map((floor) => (
          <form
            key={floor.id}
            onSubmit={(event) => {
              event.preventDefault();
              void saveFloor(floor, event.currentTarget);
            }}
            className="grid gap-2 rounded-xl border border-white/10 p-3 xl:grid-cols-[1fr_7rem_7rem_auto]"
          >
            <Input name="name" defaultValue={floor.name} aria-label={`اسم ${floor.name}`} />
            <Input
              name="floorNumber"
              type="number"
              defaultValue={floor.floor_number ?? ""}
              placeholder="Floor #"
              aria-label={`رقم ${floor.name}`}
            />
            <Input
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={floor.sort_order}
              aria-label={`ترتيب ${floor.name}`}
            />
            <div className="flex flex-wrap gap-1">
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                disabled={savingId === floor.id}
                aria-label={`حفظ ${floor.name}`}
              >
                {savingId === floor.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
              </Button>
              <Button asChild type="button" size="sm" variant="outline">
                <label className="cursor-pointer">
                  <Upload className="mr-1 size-4" />
                  {uploadState[floor.id] === "uploading" || uploadState[floor.id] === "processing"
                    ? "Uploading…"
                    : floor.floor_plan_url
                      ? "Replace plan"
                      : "Upload plan"}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadState[floor.id] === "uploading"}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadFloorPlan(floor, file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </Button>
              <Button asChild type="button" size="sm" variant="outline">
                <Link
                  to="/admin/projects/$id/tours/$tourId/floors/$floorId/editor"
                  params={{ id: tour.project_id, tourId: tour.id, floorId: floor.id }}
                >
                  <MapPinned className="mr-1 size-4" /> Edit Floor Plan
                </Link>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`حذف ${floor.name}`}
                onClick={() => setDeleteId(floor.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </form>
        ))}
      </div>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الطابق؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم فصل المشاهد المرتبطة عن الطابق، ولن يتم حذف المشاهد نفسها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (!deleteId) return;
                void deleteFloor(deleteId)
                  .then(onChanged)
                  .then(() => toast.success("تم حذف الطابق."))
                  .catch(() => toast.error("تعذر حذف الطابق."))
                  .finally(() => setDeleteId(null));
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

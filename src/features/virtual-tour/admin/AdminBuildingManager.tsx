import { useState } from "react";
import { Building2, Loader2, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectWithRelations } from "@/lib/types";
import {
  assignUnitToBuilding,
  createProjectBuilding,
  deleteProjectBuilding,
  useProjectBuildings,
} from "./adminQueries";

interface AdminBuildingManagerProps {
  project: ProjectWithRelations;
}

export function AdminBuildingManager({ project }: AdminBuildingManagerProps) {
  const queryClient = useQueryClient();
  const buildingsQuery = useProjectBuildings(project.id);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [floorsCount, setFloorsCount] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [unitBuildingIds, setUnitBuildingIds] = useState<Record<string, string>>(() =>
    Object.fromEntries(project.unit_types.map((unit) => [unit.id, unit.building_id ?? ""])),
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["virtual-tour-admin", "projects", project.id, "buildings"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["virtual-tour-admin", "projects", project.id, "tours"],
      }),
      queryClient.invalidateQueries({ queryKey: ["project", project.slug] }),
    ]);
  };

  const addBuilding = async () => {
    const cleanName = name.trim();
    const parsedFloors = floorsCount ? Number(floorsCount) : null;
    if (!cleanName) return toast.error("اسم البرج مطلوب.");
    if (parsedFloors !== null && (!Number.isInteger(parsedFloors) || parsedFloors <= 0)) {
      return toast.error("عدد الطوابق يجب أن يكون رقمًا صحيحًا موجبًا.");
    }
    setSavingKey("new");
    try {
      await createProjectBuilding({
        tenant_id: project.tenant_id,
        project_id: project.id,
        name: cleanName,
        floors_count: parsedFloors,
        sort_order: buildingsQuery.data?.length ?? 0,
      });
      await refresh();
      setName("");
      setFloorsCount("");
      setCreating(false);
      toast.success("تمت إضافة البرج.");
    } catch {
      toast.error("تعذر إضافة البرج. تأكد أن الاسم غير مستخدم.");
    } finally {
      setSavingKey(null);
    }
  };

  const removeBuilding = async (buildingId: string) => {
    setSavingKey(buildingId);
    try {
      await deleteProjectBuilding(buildingId);
      setUnitBuildingIds((current) =>
        Object.fromEntries(
          Object.entries(current).map(([unitId, value]) => [
            unitId,
            value === buildingId ? "" : value,
          ]),
        ),
      );
      await refresh();
      toast.success("تم حذف البرج.");
    } catch {
      toast.error("لا يمكن حذف برج مرتبط بجولة. انقل الجولة أولًا.");
    } finally {
      setSavingKey(null);
    }
  };

  const setUnitBuilding = async (unitId: string, buildingId: string | null) => {
    setSavingKey(`unit:${unitId}`);
    try {
      await assignUnitToBuilding(unitId, buildingId);
      setUnitBuildingIds((current) => ({ ...current, [unitId]: buildingId ?? "" }));
      await refresh();
      toast.success("تم ربط الوحدة بالبرج.");
    } catch {
      toast.error("تعذر ربط الوحدة بالبرج.");
    } finally {
      setSavingKey(null);
    }
  };

  const buildings = buildingsQuery.data ?? [];

  return (
    <section className="glass gold-hairline mt-6 rounded-2xl p-5" aria-labelledby="buildings-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="buildings-title"
            className="flex items-center gap-2 font-display text-xl text-cream"
          >
            <Building2 className="size-5 text-gold" /> أبراج المشروع
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            اختياري للمشروعات متعددة الأبراج؛ المشروعات القديمة تعمل بدون تغيير.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setCreating((value) => !value)}
        >
          <Plus className="mr-1 size-4" /> إضافة برج
        </Button>
      </div>

      {creating && (
        <div className="mt-4 grid gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-[1fr_10rem_auto]">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="مثال: Tower A"
            maxLength={120}
            aria-label="اسم البرج"
          />
          <Input
            value={floorsCount}
            onChange={(event) => setFloorsCount(event.target.value)}
            type="number"
            min={1}
            placeholder="عدد الطوابق"
            aria-label="عدد الطوابق"
          />
          <Button type="button" disabled={savingKey === "new"} onClick={() => void addBuilding()}>
            {savingKey === "new" && <Loader2 className="mr-1 size-4 animate-spin" />} حفظ
          </Button>
        </div>
      )}

      {buildingsQuery.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">جاري تحميل الأبراج…</p>
      ) : buildingsQuery.isError ? (
        <p className="mt-4 text-sm text-destructive">تعذر تحميل الأبراج.</p>
      ) : buildings.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">المشروع يُعامل حاليًا كمبنى واحد.</p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((building) => (
            <article
              key={building.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 p-3"
            >
              <Building2 className="size-4 shrink-0 text-gold" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-cream">{building.name}</p>
                <p className="text-xs text-muted-foreground">
                  {building.floors_count ? `${building.floors_count} طابق` : "عدد الطوابق غير محدد"}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={savingKey === building.id}
                aria-label={`حذف ${building.name}`}
                onClick={() => void removeBuilding(building.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </article>
          ))}
        </div>
      )}

      {buildings.length > 0 && project.unit_types.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <h3 className="text-sm font-medium text-cream">ربط الوحدات بالأبراج</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {project.unit_types.map((unit) => (
              <label key={unit.id} className="flex items-center gap-3 text-xs text-cream">
                <span className="min-w-0 flex-1 truncate">{unit.label}</span>
                <select
                  value={unitBuildingIds[unit.id] ?? ""}
                  disabled={savingKey === `unit:${unit.id}`}
                  onChange={(event) => void setUnitBuilding(unit.id, event.target.value || null)}
                  className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm"
                  aria-label={`البرج الخاص بوحدة ${unit.label}`}
                >
                  <option value="">بدون برج</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Edit3, Eye, Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  createTour,
  deleteTour,
  fetchAdminTour,
  updateTour,
  useAdminTours,
  useCanManageTourProject,
} from "./adminQueries";
import { validateTourForPublish } from "./adminValidation";

interface AdminTourManagerProps {
  project: ProjectWithRelations;
}

function friendlyError(): string {
  return "تعذر حفظ التغييرات. تحقق من الصلاحيات والبيانات ثم حاول مرة أخرى.";
}

export function AdminTourManager({ project }: AdminTourManagerProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toursQuery = useAdminTours(project.id);
  const accessQuery = useCanManageTourProject(project.tenant_id);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unitId, setUnitId] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["virtual-tour-admin", "projects", project.id, "tours"],
    });

  if (accessQuery.isLoading || toursQuery.isLoading) {
    return (
      <div className="mt-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> جاري تحميل الجولات…
      </div>
    );
  }
  if (accessQuery.isError || !accessQuery.data) {
    return (
      <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-cream">
        ليس لديك صلاحية إدارة جولات هذا المشروع.
      </div>
    );
  }

  const submitCreate = async () => {
    const cleanName = name.trim();
    if (!cleanName) return toast.error("اسم الجولة مطلوب.");
    const safeThumbnail = thumbnailUrl.trim() ? safeHttpUrl(thumbnailUrl.trim()) : null;
    if (thumbnailUrl.trim() && !safeThumbnail) return toast.error("رابط Thumbnail غير صالح.");
    setSaving(true);
    try {
      const tour = await createTour({
        project_id: project.id,
        tenant_id: project.tenant_id,
        unit_id: unitId || null,
        name: cleanName,
        description: description.trim() || null,
        thumbnail_url: safeThumbnail,
        is_published: false,
      });
      await refresh();
      toast.success("تم إنشاء الجولة كمسودة.");
      void navigate({
        to: "/admin/projects/$id/tours/$tourId",
        params: { id: project.id, tourId: tour.id },
      });
    } catch {
      toast.error(friendlyError());
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (tourId: string, publish: boolean) => {
    try {
      if (publish) {
        const bundle = await fetchAdminTour(project.id, tourId);
        if (!bundle) return toast.error("الجولة غير موجودة.");
        const errors = validateTourForPublish(bundle.scenes, bundle.hotspots);
        if (errors.length) return toast.error(errors[0]);
      }
      await updateTour(tourId, { is_published: publish });
      await refresh();
      toast.success(publish ? "تم نشر الجولة." : "تم إلغاء نشر الجولة.");
    } catch {
      toast.error(friendlyError());
    }
  };

  return (
    <section className="mt-8" aria-labelledby="tour-manager-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="tour-manager-title" className="font-display text-2xl text-cream">
            360 Virtual Tours
          </h2>
          <p className="text-sm text-muted-foreground">
            أنشئ الجولات والمشاهد والنقاط التفاعلية من لوحة الإدارة.
          </p>
        </div>
        <Button
          onClick={() => setCreating((value) => !value)}
          className="bg-gold text-gold-foreground hover:bg-gold/90"
        >
          <Plus className="mr-1 size-4" /> Create Tour
        </Button>
      </div>

      {creating && (
        <div className="glass gold-hairline mt-5 grid gap-4 rounded-2xl p-5 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm text-cream">
            اسم الجولة
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          </label>
          <label className="grid gap-1.5 text-sm text-cream">
            الوحدة — اختياري
            <select
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Project Tour</option>
              {(project.unit_types ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-cream md:col-span-2">
            الوصف
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-cream md:col-span-2">
            Thumbnail URL — اختياري
            <Input
              value={thumbnailUrl}
              onChange={(event) => setThumbnailUrl(event.target.value)}
              placeholder="https://…"
            />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button
              disabled={saving}
              onClick={() => void submitCreate()}
              className="bg-gold text-gold-foreground"
            >
              {saving && <Loader2 className="mr-1 size-4 animate-spin" />} إنشاء كمسودة
            </Button>
            <Button variant="outline" onClick={() => setCreating(false)}>
              إلغاء
            </Button>
          </div>
          <p className="text-xs text-muted-foreground md:col-span-2">
            يتم إنشاء الجولة كمسودة. يمكن نشرها بعد إضافة Scene منشورة وPanorama صالحة.
          </p>
        </div>
      )}

      {toursQuery.isError ? (
        <div className="mt-5 rounded-2xl border border-destructive/30 p-5 text-sm text-cream">
          تعذر تحميل الجولات.
        </div>
      ) : toursQuery.data?.length === 0 ? (
        <div className="glass mt-5 rounded-2xl p-8 text-center">
          <p className="text-cream">لا توجد جولات 360 حتى الآن</p>
          <Button variant="outline" className="mt-4" onClick={() => setCreating(true)}>
            إنشاء أول جولة
          </Button>
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          {toursQuery.data?.map(({ tour, floorCount, sceneCount }) => {
            const thumbnail = safeHttpUrl(tour.thumbnail_url);
            return (
              <article
                key={tour.id}
                className="glass gold-hairline flex flex-wrap items-center gap-4 rounded-2xl p-4"
              >
                <div className="size-16 overflow-hidden rounded-xl bg-white/5">
                  {thumbnail ? (
                    <img src={thumbnail} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-xs text-muted-foreground">
                      360°
                    </div>
                  )}
                </div>
                <div className="min-w-44 flex-1">
                  <h3 className="font-display text-lg text-cream">{tour.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {sceneCount} scenes · {floorCount} floors · Updated{" "}
                    {new Date(tour.updated_at).toLocaleDateString()}
                  </p>
                  <span
                    className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] ${tour.is_published ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-cream/65"}`}
                  >
                    {tour.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/admin/projects/$id/tours/$tourId"
                      params={{ id: project.id, tourId: tour.id }}
                    >
                      <Edit3 className="mr-1 size-4" /> Edit
                    </Link>
                  </Button>
                  {sceneCount > 0 && (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        to="/admin/projects/$id/tours/$tourId"
                        params={{ id: project.id, tourId: tour.id }}
                        search={{ preview: true }}
                      >
                        <Eye className="mr-1 size-4" /> Preview
                      </Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void togglePublish(tour.id, !tour.is_published)}
                  >
                    {tour.is_published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`حذف ${tour.name}`}
                    onClick={() => setDeleteId(tour.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الجولة نهائيًا؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف Floors وScenes وHotspots المرتبطة بسبب Cascade. لا يمكن التراجع عن ذلك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (!deleteId) return;
                void deleteTour(deleteId)
                  .then(refresh)
                  .then(() => toast.success("تم حذف الجولة."))
                  .catch(() => toast.error(friendlyError()))
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

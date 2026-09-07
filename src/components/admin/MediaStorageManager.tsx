import { useCallback, useEffect, useState } from "react";
import { HardDrive, ImageDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatImageBytes, optimizeProjectImage, thumbnailPathFromStoragePath } from "@/lib/image-optimization";
import { PROJECT_MEDIA_BUCKET } from "@/lib/media";

type MediaOverview = {
  object_count: number;
  total_bytes: number;
  largest_bytes: number;
  thumbnail_count: number;
  missing_thumbnail_count: number;
};

type MissingThumbnail = { object_path: string; size_bytes: number };

export function MediaStorageManager({ canManage }: { canManage: boolean }) {
  const [overview, setOverview] = useState<MediaOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("platform_media_storage_overview");
    setLoading(false);
    if (error) return toast.error(error.message);
    setOverview(data as MediaOverview);
  }, [canManage]);

  useEffect(() => { void load(); }, [load]);

  async function createMissingThumbnails() {
    if (!canManage || processing) return;
    setProcessing(true);
    setProgress({ done: 0, total: 0 });
    try {
      const { data, error } = await supabase.rpc("platform_media_missing_thumbnails", { batch_limit: 20 });
      if (error) throw error;
      const rows = (data ?? []) as MissingThumbnail[];
      setProgress({ done: 0, total: rows.length });
      if (!rows.length) {
        toast.success("Every supported image already has a thumbnail");
        return;
      }

      let completed = 0;
      for (const [index, row] of rows.entries()) {
        const { data: blob, error: downloadError } = await supabase.storage
          .from(PROJECT_MEDIA_BUCKET)
          .download(row.object_path);
        if (downloadError) throw downloadError;
        const source = new File([blob], row.object_path.split("/").pop() || "image", { type: blob.type });
        const optimized = await optimizeProjectImage(source);
        if (!optimized.thumbnail) continue;
        const { error: uploadError } = await supabase.storage
          .from(PROJECT_MEDIA_BUCKET)
          .upload(thumbnailPathFromStoragePath(row.object_path), optimized.thumbnail, {
            cacheControl: "31536000",
            contentType: optimized.thumbnail.type,
            upsert: false,
          });
        if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
        completed += 1;
        setProgress({ done: index + 1, total: rows.length });
      }
      toast.success(`${completed} thumbnail${completed === 1 ? "" : "s"} created`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Thumbnail processing failed");
    } finally {
      setProcessing(false);
    }
  }

  if (!canManage) return null;
  const storagePercent = overview ? Math.min(100, Math.round((overview.total_bytes / (1024 ** 3)) * 100)) : 0;
  return <section className="mt-10 scroll-mt-24">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-display text-3xl text-cream"><HardDrive className="h-6 w-6 text-gold" /> Media usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">Storage health and legacy thumbnail processing.</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading || processing}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
    </div>
    {overview ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Stored files" value={overview.object_count.toLocaleString()} />
      <Metric label="Storage used" value={`${formatImageBytes(overview.total_bytes)} · ${storagePercent}% of 1 GB`} warning={storagePercent >= 80} />
      <Metric label="Largest file" value={formatImageBytes(overview.largest_bytes)} />
      <Metric label="Thumbnails" value={overview.thumbnail_count.toLocaleString()} />
      <Metric label="Missing thumbnails" value={overview.missing_thumbnail_count.toLocaleString()} warning={overview.missing_thumbnail_count > 0} />
    </div> : null}
    <div className="glass gold-hairline mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div className="text-sm text-muted-foreground">Processes up to 20 old images per run. Original files are preserved.</div>
      <Button type="button" onClick={() => void createMissingThumbnails()} disabled={processing || !overview?.missing_thumbnail_count} className="bg-gold text-gold-foreground hover:bg-gold/90">
        <ImageDown className="mr-1 h-4 w-4" /> {processing ? `Processing ${progress.done}/${progress.total}` : "Create missing thumbnails"}
      </Button>
    </div>
  </section>;
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="glass gold-hairline rounded-2xl p-3"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className={`mt-1 font-display text-xl ${warning ? "text-amber-400" : "text-cream"}`}>{value}</div></div>;
}

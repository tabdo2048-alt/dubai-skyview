import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveTourThumbnailUrl } from "../thumbnailUrl";
import type { TourSceneRow } from "../types";

interface AdminSceneListItemProps {
  scene: TourSceneRow;
  floorName: string | null;
  hotspotCount: number;
  current: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function AdminSceneListItem({
  scene,
  floorName,
  hotspotCount,
  current,
  onSelect,
  onDelete,
}: AdminSceneListItemProps) {
  const thumbnailQuery = useQuery({
    queryKey: ["virtual-tour-admin", "scene", scene.id, "thumbnail", scene.thumbnail_url],
    queryFn: () => resolveTourThumbnailUrl(scene.thumbnail_url),
    enabled: Boolean(scene.thumbnail_url),
    staleTime: 50 * 60 * 1000,
  });
  return (
    <div
      className={`min-w-64 rounded-xl border p-3 ${current ? "border-gold bg-gold/10" : "border-white/10"}`}
    >
      <button
        type="button"
        className="flex w-full gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        onClick={onSelect}
        aria-current={current ? "page" : undefined}
      >
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/5 text-[10px] text-muted-foreground">
          {thumbnailQuery.data ? (
            <img
              src={thumbnailQuery.data}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            "360°"
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-cream">{scene.name}</span>
          <span className="block text-[11px] text-muted-foreground">
            {floorName ?? "No Floor"} · {scene.panorama_url ? "Panorama ready" : "No panorama"}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {scene.is_published ? "Published" : "Draft"} · {hotspotCount} hotspots · Order{" "}
            {scene.sort_order}
          </span>
        </span>
      </button>
      <Button
        size="icon"
        variant="ghost"
        className="mt-2"
        aria-label={`حذف ${scene.name}`}
        onClick={onDelete}
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}

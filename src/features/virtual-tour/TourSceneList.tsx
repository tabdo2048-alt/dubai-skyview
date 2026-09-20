import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon } from "lucide-react";
import type { TourSceneRow } from "./types";
import { resolveTourThumbnailUrl } from "./thumbnailUrl";

function SceneThumbnail({ scene }: { scene: TourSceneRow }) {
  const thumbnail = useQuery({
    queryKey: ["virtual-tours", "scene", scene.id, "thumbnail", scene.thumbnail_url],
    queryFn: () => resolveTourThumbnailUrl(scene.thumbnail_url),
    enabled: Boolean(scene.thumbnail_url),
    staleTime: 50 * 60 * 1000,
    retry: 1,
  });
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.06] text-cream/35 lg:size-12">
      {thumbnail.data ? (
        <img src={thumbnail.data} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <ImageIcon className="size-4" aria-hidden="true" />
      )}
    </span>
  );
}

interface TourSceneListProps {
  scenes: TourSceneRow[];
  currentSceneId: string;
  navigateToScene: (sceneId: string) => boolean;
}

export function TourSceneList({ scenes, currentSceneId, navigateToScene }: TourSceneListProps) {
  return (
    <nav
      aria-label="Tour scenes"
      className="flex gap-2 overflow-x-auto px-3 py-3 lg:block lg:space-y-2 lg:overflow-y-auto lg:px-4"
    >
      {scenes.map((scene) => {
        const active = scene.id === currentSceneId;
        return (
          <button
            key={scene.id}
            type="button"
            onClick={() => navigateToScene(scene.id)}
            aria-current={active ? "page" : undefined}
            disabled={active}
            className={
              "flex shrink-0 items-center gap-2 rounded-xl px-2 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold lg:w-full lg:text-left " +
              (active
                ? "bg-gold font-medium text-gold-foreground"
                : "glass gold-hairline text-cream hover:bg-gold/10 hover:text-gold")
            }
          >
            <SceneThumbnail scene={scene} />
            <span className="max-w-32 truncate lg:max-w-none">{scene.name}</span>
          </button>
        );
      })}
    </nav>
  );
}

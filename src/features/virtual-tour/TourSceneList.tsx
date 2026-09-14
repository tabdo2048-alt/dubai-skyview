import { Link } from "@tanstack/react-router";
import type { TourSceneRow } from "./types";

interface TourSceneListProps {
  slug: string;
  tourId: string;
  scenes: TourSceneRow[];
  currentSceneId: string;
}
export function TourSceneList({ slug, tourId, scenes, currentSceneId }: TourSceneListProps) {
  return (
    <nav aria-label="Tour scenes" className="flex gap-2 overflow-x-auto px-3 py-3 lg:block lg:space-y-2 lg:overflow-y-auto lg:px-4">
      {scenes.map((scene) => {
        const active = scene.id === currentSceneId;
        return (
          <Link
            key={scene.id}
            to="/projects/$slug/tour/$tourId/scene/$sceneId"
            params={{ slug, tourId, sceneId: scene.id }}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition lg:block lg:w-full lg:rounded-xl lg:text-left ${
              active
                ? "bg-gold font-medium text-gold-foreground"
                : "glass gold-hairline text-cream hover:bg-gold/10 hover:text-gold"
            }`}
          >
            {scene.name}
          </Link>
        );
      })}
    </nav>
  );
}

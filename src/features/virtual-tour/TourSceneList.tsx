import type { TourSceneRow } from "./types";

interface TourSceneListProps {
  scenes: TourSceneRow[];
  currentSceneId: string;
  navigateToScene: (sceneId: string) => boolean;
}

export function TourSceneList({
  scenes,
  currentSceneId,
  navigateToScene,
}: TourSceneListProps) {
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
              "shrink-0 rounded-full px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold lg:block lg:w-full lg:rounded-xl lg:text-left " +
              (active
                ? "bg-gold font-medium text-gold-foreground"
                : "glass gold-hairline text-cream hover:bg-gold/10 hover:text-gold")
            }
          >
            {scene.name}
          </button>
        );
      })}
    </nav>
  );
}

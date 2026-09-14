import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { TourSceneRow } from "./types";

interface UseTourNavigationOptions {
  slug: string;
  tourId: string;
  scenes: TourSceneRow[];
  onBeforeNavigate?: () => void;
}

export function useTourNavigation({
  slug,
  tourId,
  scenes,
  onBeforeNavigate,
}: UseTourNavigationOptions) {
  const navigate = useNavigate();
  const publishedSceneIds = useMemo(
    () => new Set(scenes.filter((scene) => scene.is_published).map((scene) => scene.id)),
    [scenes],
  );

  return useCallback(
    (sceneId: string) => {
      if (!publishedSceneIds.has(sceneId)) return false;
      onBeforeNavigate?.();
      void navigate({
        to: "/projects/$slug/tour/$tourId/scene/$sceneId",
        params: { slug, tourId, sceneId },
      });
      return true;
    },
    [navigate, onBeforeNavigate, publishedSceneIds, slug, tourId],
  );
}

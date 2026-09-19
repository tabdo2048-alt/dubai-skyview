import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { selectDefaultTourScene, virtualTourQueryOptions } from "@/features/virtual-tour/queries";

export const Route = createFileRoute("/projects_/$slug/tour/$tourId/")({
  ssr: false,
  loader: async ({ params, context }) => {
    const bundle = await context.queryClient.ensureQueryData(virtualTourQueryOptions(params.slug, params.tourId));
    const firstScene = bundle ? selectDefaultTourScene(bundle.scenes) : null;
    if (!bundle || !firstScene) throw notFound();
    throw redirect({
      to: "/projects/$slug/tour/$tourId/scene/$sceneId",
      params: { slug: params.slug, tourId: params.tourId, sceneId: firstScene.id },
      replace: true,
    });
  },
});

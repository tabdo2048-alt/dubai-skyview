import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { findTourScene, virtualTourQueryOptions } from "@/features/virtual-tour/queries";
import { resolvePanoramaUrl } from "@/features/virtual-tour/panoramaUrl";
import { TourError } from "@/features/virtual-tour/TourError";
import { TourPage } from "@/features/virtual-tour/TourPage";

export const Route = createFileRoute("/projects_/$slug/tour/$tourId/scene/$sceneId")({
  ssr: false,
  loader: async ({ params, context }) => {
    const bundle = await context.queryClient.ensureQueryData(virtualTourQueryOptions(params.slug, params.tourId));
    if (!bundle) throw notFound();
    const scene = findTourScene(bundle.scenes, params.sceneId);
    if (!scene) throw notFound();
    if (scene.panorama_type !== "equirectangular") {
      throw new Error("This panorama format is not supported by the basic viewer yet.");
    }
    const panoramaUrl = await resolvePanoramaUrl(scene.panorama_url);
    return { bundle, scene, panoramaUrl };
  },
  component: TourSceneRoute,
  errorComponent: TourRouteError,
  notFoundComponent: TourNotFound,
});

function TourSceneRoute() {
  const data = Route.useLoaderData();
  return <TourPage bundle={data.bundle} scene={data.scene} panoramaUrl={data.panoramaUrl} />;
}

function TourRouteError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <main className="fixed inset-0 bg-[#080a0d]">
      <TourError
        message={error.message || "تعذر تحميل بيانات الجولة."}
        onRetry={() => {
          router.invalidate();
          reset();
        }}
      />
    </main>
  );
}

function TourNotFound() {
  return (
    <main className="fixed inset-0 grid place-items-center bg-[#080a0d] px-4 text-center">
      <div>
        <h1 className="font-display text-3xl text-cream">Tour not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">The tour or scene is unavailable.</p>
        <Link to="/" className="mt-5 inline-block text-sm text-gold underline-offset-4 hover:underline">Back to map</Link>
      </div>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// MapContainer statically imports MapboxView, which statically imports mapbox-gl
// (~800 KB) — so importing it here put the entire map engine in the bundle for
// this route's first paint, ahead of the navbar and sidebar that surround it.
// Behind a lazy boundary the shell paints first and mapbox-gl streams in after.
//
// Three.js and the road/coastline data blobs are already split further down
// (MapboxView dynamically imports WaterLayer and StationModelLayer), so this
// boundary is the last eager edge on the critical path.
const MapContainer = lazy(() =>
  import("@/components/map/MapContainer").then((m) => ({ default: m.MapContainer })),
);

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex h-screen flex-col">
      <AppNavbar />
      <div className="relative flex-1 overflow-hidden">
        <AppSidebar />
        <ErrorBoundary>
          {/* `null`, not a spinner: MapContainer draws its own loading overlay
              once mounted, and a second indicator here would flash between the
              two. The area is already occupied by the sidebar and navbar. */}
          <Suspense fallback={null}>
            <MapContainer />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MapContainer } from "@/components/map/MapContainer";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex h-screen flex-col">
      <AppNavbar />
      <div className="relative flex-1 overflow-hidden">
        <AppSidebar />
        <MapContainer />
      </div>
    </div>
  );
}

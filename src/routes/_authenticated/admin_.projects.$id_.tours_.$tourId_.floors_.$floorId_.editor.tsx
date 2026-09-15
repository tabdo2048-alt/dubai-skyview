import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AdminFloorPlanEditor } from "@/features/virtual-tour/admin/AdminFloorPlanEditor";
import { useProjectById } from "@/hooks/use-projects";

interface FloorEditorSearch {
  scene?: string;
}

export const Route = createFileRoute(
  "/_authenticated/admin_/projects/$id_/tours_/$tourId_/floors_/$floorId_/editor",
)({
  validateSearch: (search: Record<string, unknown>): FloorEditorSearch => ({
    scene: typeof search.scene === "string" && search.scene ? search.scene : undefined,
  }),
  component: AdminProjectFloorPlanEditorPage,
});

function AdminProjectFloorPlanEditorPage() {
  const { id, tourId, floorId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const projectQuery = useProjectById(id);

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <main className="mx-auto max-w-[1800px] px-4 py-8">
        {projectQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Loading project…
          </div>
        ) : projectQuery.isError || !projectQuery.data ? (
          <div className="text-cream">Project not found.</div>
        ) : (
          <AdminFloorPlanEditor
            project={projectQuery.data}
            tourId={tourId}
            floorId={floorId}
            selectedSceneId={search.scene ?? null}
            onSelectScene={(sceneId) =>
              void navigate({
                to: "/admin/projects/$id/tours/$tourId/floors/$floorId/editor",
                params: { id, tourId, floorId },
                search: { scene: sceneId },
              })
            }
          />
        )}
      </main>
    </div>
  );
}

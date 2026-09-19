import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { useProjectById } from "@/hooks/use-projects";
import { AdminTourEditor } from "@/features/virtual-tour/admin/AdminTourEditor";

interface TourEditorSearch {
  scene?: string;
  preview?: boolean;
}

export const Route = createFileRoute("/_authenticated/admin_/projects/$id_/tours_/$tourId")({
  validateSearch: (search: Record<string, unknown>): TourEditorSearch => ({
    scene: typeof search.scene === "string" && search.scene ? search.scene : undefined,
    preview: search.preview === true || search.preview === "true" ? true : undefined,
  }),
  component: AdminProjectTourEditorPage,
});

function AdminProjectTourEditorPage() {
  const { id, tourId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const projectQuery = useProjectById(id);
  return (
    <div className="min-h-screen">
      <AppNavbar />
      <main className="mx-auto max-w-[1600px] px-4 py-8">
        {projectQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Loading project…
          </div>
        ) : projectQuery.isError || !projectQuery.data ? (
          <div className="text-cream">Project not found.</div>
        ) : (
          <AdminTourEditor
            project={projectQuery.data}
            tourId={tourId}
            selectedSceneId={search.scene ?? null}
            preview={Boolean(search.preview)}
            onSelectScene={(sceneId, preview = false) =>
              void navigate({
                to: "/admin/projects/$id/tours/$tourId",
                params: { id, tourId },
                search: { scene: sceneId || undefined, preview: preview || undefined },
              })
            }
          />
        )}
      </main>
    </div>
  );
}

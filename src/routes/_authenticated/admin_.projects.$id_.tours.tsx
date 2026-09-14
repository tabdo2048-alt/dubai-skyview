import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";
import { useProjectById } from "@/hooks/use-projects";
import { AdminTourManager } from "@/features/virtual-tour/admin/AdminTourManager";

export const Route = createFileRoute("/_authenticated/admin_/projects/$id_/tours")({
  component: AdminProjectToursPage,
});

function AdminProjectToursPage() {
  const { id } = Route.useParams();
  const projectQuery = useProjectById(id);
  return (
    <div className="min-h-screen">
      <AppNavbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Button asChild variant="ghost">
          <Link to="/admin/projects/$id" params={{ id }}>
            <ArrowLeft className="mr-1 size-4" /> Project
          </Link>
        </Button>
        {projectQuery.isLoading ? (
          <div className="mt-10 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading project…
          </div>
        ) : projectQuery.isError || !projectQuery.data ? (
          <div className="mt-10 text-cream">Project not found.</div>
        ) : (
          <>
            <h1 className="mt-5 font-display text-3xl text-cream">
              {projectQuery.data.name} <span className="text-gold-gradient">Tours</span>
            </h1>
            <AdminTourManager project={projectQuery.data} />
          </>
        )}
      </main>
    </div>
  );
}

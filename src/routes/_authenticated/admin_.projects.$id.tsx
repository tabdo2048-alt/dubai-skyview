import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useProjectById } from "@/hooks/use-projects";
import { useTenantStore } from "@/store/tenant";
import { ProjectForm } from "./admin";

// `admin_` (trailing underscore) un-nests this from admin.tsx so it renders as a
// standalone full page at /admin/projects/$id (admin.tsx has no <Outlet/>).
export const Route = createFileRoute("/_authenticated/admin_/projects/$id")({
  component: EditProjectPage,
});

// Dedicated edit page. Renders the shared ProjectForm only once the project has
// loaded, so the form always mounts with populated data (fixes the inline form's
// "reload to edit" bug). Remounts per id — switching projects just works.
function EditProjectPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProjectById(id);
  const { currentTenantId, loaded: tenantLoaded, load: loadTenants } = useTenantStore();
  useEffect(() => { void loadTenants(); }, [loadTenants]);
  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-cream">
          <Link to="/admin">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to projects
          </Link>
        </Button>
        <h1 className="mt-4 font-display text-3xl text-cream">
          Edit <span className="text-gold-gradient">project</span>
        </h1>

        {!tenantLoaded || isLoading ? (
          <div className="mt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !currentTenantId ? (
          <div className="mt-6 text-muted-foreground">This account has no active organization.</div>
        ) : !project ? (
          <div className="mt-6 text-muted-foreground">Project not found.</div>
        ) : (
          <div className="mt-4">
            <ProjectForm id={id} tenantId={currentTenantId} onClose={() => navigate({ to: "/admin" })} />
          </div>
        )}
      </div>
    </div>
  );
}

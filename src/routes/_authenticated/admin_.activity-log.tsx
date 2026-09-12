import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AuditLogManager } from "@/components/admin/AuditLogManager";
import { Button } from "@/components/ui/button";
import { useAuth, useIsAdmin } from "@/hooks/use-auth";
import { isPlatformOwner } from "@/lib/platform-owner";

export const Route = createFileRoute("/_authenticated/admin_/activity-log")({
  head: () => ({ meta: [{ title: "Activity log — KEYORA" }] }),
  component: ActivityLogPage,
});

function ActivityLogPage() {
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const { data: isAdmin, isLoading } = useIsAdmin(user);
  const canView = Boolean(isAdmin && isPlatformOwner(user));

  useEffect(() => {
    if (ready && !isLoading && !canView) {
      navigate({ to: "/admin", replace: true });
    }
  }, [canView, isLoading, navigate, ready]);

  if (!ready || isLoading) {
    return (
      <div className="min-h-screen">
        <AppNavbar />
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
        </div>
      </div>
    );
  }

  if (!canView) return null;

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-cream">
          <Link to="/admin/platform"><ArrowLeft className="mr-1 h-4 w-4" /> Back to platform control</Link>
        </Button>
        <h1 className="mt-4 font-display text-4xl text-cream">
          Activity <span className="text-gold-gradient">log</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Successful sign-ins and project creation events. Visible only to the platform owner.
        </p>
        <AuditLogManager canView />
      </div>
    </div>
  );
}

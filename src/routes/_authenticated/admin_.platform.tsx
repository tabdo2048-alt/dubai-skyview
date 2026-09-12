import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";
import { useAuth, useIsAdmin } from "@/hooks/use-auth";
import { PublicProjectsManager } from "./admin";
import { PoiManager } from "@/components/admin/PoiManager";
import { SubscribersManager, UsersManager } from "@/components/admin/PlatformAccountManagers";
import { MediaStorageManager } from "@/components/admin/MediaStorageManager";
import { isPlatformOwner } from "@/lib/platform-owner";
import { AuditLogManager } from "@/components/admin/AuditLogManager";

// `admin_` (trailing underscore) un-nests this to a standalone /admin/platform
// page. Platform-admin (has_role 'admin') ONLY — separate from the per-org
// /admin workspace. Holds subscriber control + the global reference data (POI).
export const Route = createFileRoute("/_authenticated/admin_/platform")({
  component: PlatformPage,
});

function PlatformPage() {
  const { user } = useAuth();
  const { data: isAdmin, isLoading } = useIsAdmin(user);
  const canManage = Boolean(isAdmin && isPlatformOwner(user));

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-cream">
          <Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" /> Back to my workspace</Link>
        </Button>
        <h1 className="mt-4 font-display text-4xl text-cream">
          Platform <span className="text-gold-gradient">control</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review subscribers and shared map data. Platform changes are restricted to the platform owner.
        </p>

        {isLoading ? (
          <div className="mt-8 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
          </div>
        ) : !isAdmin ? (
          <div className="mt-8 text-muted-foreground">This account is not a platform administrator.</div>
        ) : (
          <>
            {!canManage ? <div className="glass gold-hairline mt-6 rounded-2xl p-4 text-sm text-muted-foreground">Read-only access. Management actions are available only to the platform owner.</div> : null}
            <AuditLogManager canView={canManage} />
            <PublicProjectsManager canManage={canManage} />
            <SubscribersManager canManage={canManage} />
            <UsersManager canManage={canManage} />
            <MediaStorageManager canManage={canManage} />
            <PoiManager canManage={canManage} />
          </>
        )}
      </div>
    </div>
  );
}

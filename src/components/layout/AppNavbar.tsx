import { Link, useRouterState } from "@tanstack/react-router";
import { Search, LogIn, LogOut, LayoutDashboard, UserPlus, UserRound } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFiltersStore } from "@/store/filters";
import { useTenantStore } from "@/store/tenant";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Map" },
  { to: "/communities", label: "Communities" },
  { to: "/developers", label: "Developers" },
] as const;

export function AppNavbar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { filters, setFilters } = useFiltersStore();
  const { user } = useAuth();
  const { tenants, currentTenantId, loaded: tenantLoaded, load: loadTenants } = useTenantStore();

  // The workspace is tenant-membership based. The old user_roles check only
  // identifies platform admins, so regular paid workspace users were missing
  // the link to their own project data.
  useEffect(() => {
    if (user) void loadTenants();
  }, [user, loadTenants]);

  const canOpenWorkspace = !!user && tenantLoaded && !!currentTenantId;
  const userMetadata = user?.user_metadata as { full_name?: unknown; name?: unknown } | undefined;
  const displayName =
    (typeof userMetadata?.full_name === "string" && userMetadata.full_name.trim()) ||
    (typeof userMetadata?.name === "string" && userMetadata.name.trim()) ||
    user?.email?.split("@")[0] ||
    "User";
  const organizationName =
    tenants.find((tenant) => tenant.id === currentTenantId)?.name || displayName;

  return (
    <header className="glass-strong sticky top-0 z-40 border-b border-border/60">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2">
          {/* 180px source for a 36px render — 5x DPR headroom at 50 KB instead of
              the 512px master's 250 KB. The master is reserved for og:image. */}
          <img
            src="/brand/keyora-logo-180.png"
            alt="KEYORA logo"
            className="h-9 w-9 rounded-xl object-contain"
          />
          <div className="hidden font-display text-xl tracking-wide text-cream sm:block">
            <span className="text-gold-gradient">KEYORA</span>
          </div>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                path === n.to || (n.to !== "/" && path.startsWith(n.to))
                  ? "bg-gold/15 text-gold"
                  : "text-cream/80 hover:bg-white/5 hover:text-cream"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex flex-1 items-center justify-end gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects, communities…"
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              className="glass gold-hairline h-9 rounded-full border-none pl-9 text-sm text-cream placeholder:text-muted-foreground"
            />
          </div>
          {user ? (
            <>
              {canOpenWorkspace && (
                <Button asChild size="sm" variant="ghost" className="text-cream hover:bg-white/5">
                  <Link to="/admin">
                    <LayoutDashboard className="mr-1 h-4 w-4" /> Admin
                  </Link>
                </Button>
              )}
              <div className="glass gold-hairline flex min-w-0 items-center gap-1 rounded-full pl-2">
                <UserRound className="h-4 w-4 shrink-0 text-gold" />
                <div className="hidden min-w-0 max-w-[120px] sm:block">
                  <div className="truncate text-xs font-medium text-cream" title={organizationName}>
                    {organizationName}
                  </div>
                  <div
                    className="truncate text-[10px] text-muted-foreground"
                    title={user.email ?? ""}
                  >
                    {user.email}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-cream hover:bg-white/5"
                  onClick={() => supabase.auth.signOut()}
                >
                  <LogOut className="mr-1 h-4 w-4" />{" "}
                  <span className="hidden md:inline">Sign out</span>
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="text-cream hover:bg-white/5">
                <Link to="/signup">
                  <UserPlus className="mr-1 h-4 w-4" /> Signup
                </Link>
              </Button>
              <Button asChild size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90">
                <Link to="/auth">
                  <LogIn className="mr-1 h-4 w-4" /> Login
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

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
    // `glass-strong` applies a border on all four sides. On a full-width sticky
    // header that painted stray gold hairlines across the top of the viewport
    // and down both screen edges, so the sides and top are zeroed out and the
    // bottom edge is drawn as a gradient hairline that fades at the corners.
    <header
      className="glass-strong sticky top-0 z-40 border-0 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-gold/40 after:to-transparent"
      // `glass-strong` sets box-shadow itself and wins the cascade against a
      // Tailwind `shadow-*` class, so the header's depth is set inline. It is
      // static rather than scroll-reactive: `html, body, #root { height: 100% }`
      // in styles.css means the window never scrolls on any route (each page
      // scrolls an inner container), so a scroll listener would never fire.
      style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.10), 0 14px 34px -26px oklch(0 0 0 / 0.8)" }}
    >
      <div className="relative mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4">
        <Link to="/" className="group flex shrink-0 items-center gap-2.5" aria-label="KEYORA home">
          {/* 180px source for a 36px render — 5x DPR headroom at 50 KB instead of
              the 512px master's 250 KB. The master is reserved for og:image.
              No rounding: the badge artwork carries its own corner radius, so any
              CSS radius here clips its gold border. */}
          <img
            src="/brand/keyora-logo-180.png"
            alt=""
            className="h-9 w-9 object-contain transition-transform duration-300 group-hover:scale-[1.06]"
          />
          <div className="hidden font-display text-xl leading-none tracking-[0.14em] sm:block">
            <span className="text-gold-gradient">KEYORA</span>
          </div>
        </Link>

        {/* Separates the brand lockup from navigation without a hard rule. */}
        <div className="ml-1 hidden h-8 w-px bg-gradient-to-b from-transparent via-gold/25 to-transparent md:block" />

        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV.map((n) => {
            const active = path === n.to || (n.to !== "/" && path.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-full px-3.5 py-1.5 text-sm transition-all duration-200 ${
                  active
                    ? "bg-gold/12 text-gold shadow-[inset_0_0_0_1px_oklch(0.78_0.13_85/0.30)]"
                    : "text-cream/75 hover:bg-white/[0.07] hover:text-cream"
                }`}
              >
                {n.label}
                {/* Underline the active tab so the state survives at a glance
                    even where the tinted pill is low contrast. */}
                <span
                  className={`absolute inset-x-3.5 -bottom-0.5 h-px rounded-full bg-gold transition-opacity duration-200 ${
                    active ? "opacity-70" : "opacity-0"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
          {/* `border-none` here used to cancel the border `gold-hairline` had just
              set, so the input rendered with no edge at all. */}
          <div className="group relative w-full min-w-0 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-gold" />
            <Input
              placeholder="Search projects, communities…"
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              className="glass gold-hairline h-9 rounded-full pl-9 pr-3 text-sm text-cream transition-shadow placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-gold/45"
            />
          </div>
          {user ? (
            <>
              {canOpenWorkspace && (
                <Button asChild size="sm" variant="ghost" className="shrink-0 text-cream hover:bg-white/[0.07] hover:text-gold">
                  <Link to="/admin">
                    <LayoutDashboard className="mr-1 h-4 w-4" />{" "}
                    <span className="hidden lg:inline">Admin</span>
                  </Link>
                </Button>
              )}
              <div className="glass gold-hairline flex min-w-0 shrink-0 items-center gap-2 rounded-full py-1 pl-2.5 pr-1">
                <UserRound className="h-4 w-4 shrink-0 text-gold" />
                <div className="hidden min-w-0 max-w-[140px] leading-tight sm:block">
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
                <div className="hidden h-6 w-px bg-gold/20 sm:block" />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-full px-2 text-cream hover:bg-white/[0.07] hover:text-gold"
                  onClick={() => supabase.auth.signOut()}
                >
                  <LogOut className="h-4 w-4 md:mr-1" />{" "}
                  <span className="hidden md:inline">Sign out</span>
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="shrink-0 px-2 text-cream hover:bg-white/[0.07] hover:text-gold sm:px-3">
                <Link to="/signup">
                  {/* Icon-only below sm: at 390px the label squeezed the search
                      field until its placeholder was cut off mid-word. */}
                  <UserPlus className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Signup</span>
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="shrink-0 px-2.5 text-gold-foreground shadow-[0_6px_18px_-8px_oklch(0.78_0.13_85/0.8)] transition-all hover:bg-gold/90 hover:shadow-[0_8px_22px_-8px_oklch(0.78_0.13_85/0.95)] sm:px-3 bg-gold"
              >
                <Link to="/auth">
                  <LogIn className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Login</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Below md the nav links were hidden with no replacement, leaving small
          screens no navigation at all. */}
      <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {NAV.map((n) => {
          const active = path === n.to || (n.to !== "/" && path.startsWith(n.to));
          return (
            <Link
              key={n.to}
              to={n.to}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
                active
                  ? "bg-gold/12 text-gold shadow-[inset_0_0_0_1px_oklch(0.78_0.13_85/0.30)]"
                  : "text-cream/70 hover:bg-white/[0.07] hover:text-cream"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

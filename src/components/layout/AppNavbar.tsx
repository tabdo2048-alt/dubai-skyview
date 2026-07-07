import { Link, useRouterState } from "@tanstack/react-router";
import { Search, LogIn, LogOut, LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/use-auth";
import { useFiltersStore } from "@/store/filters";
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
  const { data: isAdmin } = useIsAdmin(user);

  return (
    <header className="glass-strong sticky top-0 z-40 border-b border-border/60">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gold text-gold-foreground shadow">
            <span className="font-display text-lg leading-none">D</span>
          </div>
          <div className="hidden font-display text-xl tracking-wide text-cream sm:block">
            Dubai <span className="text-gold-gradient">Residences</span>
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
              {isAdmin && (
                <Button asChild size="sm" variant="ghost" className="text-cream hover:bg-white/5">
                  <Link to="/admin">
                    <LayoutDashboard className="mr-1 h-4 w-4" /> Admin
                  </Link>
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-cream hover:bg-white/5" onClick={() => supabase.auth.signOut()}>
                <LogOut className="mr-1 h-4 w-4" /> Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Link to="/auth">
                <LogIn className="mr-1 h-4 w-4" /> Login
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

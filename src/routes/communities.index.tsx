import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { useCommunities, useProjects } from "@/hooks/use-projects";
import { useFiltersStore } from "@/store/filters";

export const Route = createFileRoute("/communities/")({
  head: () => ({
    meta: [
      { title: "Communities — Dubai Residences" },
      { name: "description", content: "Explore Dubai's most desirable communities: Downtown, Marina, Palm Jumeirah, Business Bay, and more." },
    ],
  }),
  component: CommunitiesIndex,
});

function CommunitiesIndex() {
  const { data: communities = [] } = useCommunities();
  const { data: projects = [] } = useProjects();
  const setFilters = useFiltersStore((s) => s.setFilters);

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Dubai</div>
          <h1 className="font-display text-5xl text-cream">Iconic <span className="text-gold-gradient">Communities</span></h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((c) => {
            const count = projects.filter((p) => p.community?.slug === c.slug).length;
            return (
              <Link
                key={c.id}
                to="/"
                onClick={() => setFilters({ communities: [c.slug] })}
                className="glass gold-hairline group relative overflow-hidden rounded-3xl"
              >
                <div className="aspect-[4/3] w-full overflow-hidden">
                  {c.hero_image_url ? (
                    <img src={c.hero_image_url} alt={c.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="h-full w-full bg-muted" />
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="font-display text-2xl text-cream">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{count} project{count === 1 ? "" : "s"}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

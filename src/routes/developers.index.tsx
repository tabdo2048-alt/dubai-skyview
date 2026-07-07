import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { useDevelopers, useProjects } from "@/hooks/use-projects";

export const Route = createFileRoute("/developers/")({
  head: () => ({
    meta: [
      { title: "Developers — Dubai Residences" },
      { name: "description", content: "Emaar, DAMAC, Nakheel, Meraas, Sobha and more — browse Dubai's leading real estate developers." },
    ],
  }),
  component: DevelopersIndex,
});

function DevelopersIndex() {
  const { data: developers = [] } = useDevelopers();
  const { data: projects = [] } = useProjects();
  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Dubai</div>
          <h1 className="font-display text-5xl text-cream">Leading <span className="text-gold-gradient">Developers</span></h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {developers.map((d) => {
            const count = projects.filter((p) => p.developer?.slug === d.slug).length;
            return (
              <Link
                key={d.id}
                to="/"
                className="glass gold-hairline rounded-2xl p-5 transition-colors hover:border-gold"
              >
                <div className="font-display text-2xl text-cream">{d.name}</div>
                <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{d.description}</div>
                <div className="mt-3 text-xs text-gold-gradient">{count} project{count === 1 ? "" : "s"}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Bed, Bath, Calendar, Wallet, Building2, MessageCircle, CalendarCheck, Download, PlayCircle } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { useProject } from "@/hooks/use-projects";
import { formatAed } from "@/lib/dubai";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/projects/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Dubai Residences` },
      { name: "description", content: `Details, gallery, and pricing for ${params.slug} in Dubai.` },
    ],
  }),
  component: ProjectDetail,
  errorComponent: ({ error }) => <div className="p-10 text-center text-muted-foreground">{error.message}</div>,
  notFoundComponent: () => <div className="p-10 text-center text-muted-foreground">Project not found.</div>,
});

function ProjectDetail() {
  const { slug } = Route.useParams();
  const { data: p, isLoading } = useProject(slug);
  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (!p) throw notFound();

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-cream">
          <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Back to map</Link>
        </Button>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div className="glass gold-hairline overflow-hidden rounded-3xl">
              <img src={p.main_image_url ?? ""} alt={p.name} className="h-[420px] w-full object-cover" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {p.images?.slice(0, 3).map((img) => (
                <div key={img.id} className="glass gold-hairline aspect-[4/3] overflow-hidden rounded-2xl">
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              <Building2 className="mr-1 inline h-3.5 w-3.5" />
              {p.developer?.name ?? "Independent"}
            </div>
            <h1 className="font-display text-5xl leading-none text-cream">{p.name}</h1>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {p.community?.name ?? p.address ?? "Dubai"}
            </div>
            <div className="glass-strong gold-hairline rounded-3xl p-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Starting from</div>
              <div className="text-gold-gradient font-display text-4xl">{formatAed(p.starting_price_aed)}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info icon={<Bed className="h-4 w-4" />} label="Bedrooms" value={`${p.bedrooms_min ?? "—"}${p.bedrooms_max && p.bedrooms_max !== p.bedrooms_min ? `–${p.bedrooms_max}` : ""}`} />
                <Info icon={<Bath className="h-4 w-4" />} label="Bathrooms" value={String(p.bathrooms ?? "—")} />
                <Info icon={<Calendar className="h-4 w-4" />} label="Handover" value={p.completion_date ?? "TBA"} />
                <Info icon={<Wallet className="h-4 w-4" />} label="Payment" value={p.payment_plan ?? "Flexible"} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-gold text-gold-foreground hover:bg-gold/90">
                <a href={`https://wa.me/971500000000?text=${encodeURIComponent(`Interested in ${p.name}`)}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" className="glass gold-hairline text-cream">
                <a href={`mailto:sales@example.ae?subject=${encodeURIComponent(`Book viewing: ${p.name}`)}`}>
                  <CalendarCheck className="mr-1 h-4 w-4" /> Book viewing
                </a>
              </Button>
              {p.brochure_url && (
                <Button asChild variant="outline" className="glass gold-hairline text-cream">
                  <a href={p.brochure_url} target="_blank" rel="noreferrer"><Download className="mr-1 h-4 w-4" /> Brochure</a>
                </Button>
              )}
              {p.tour_360_url && (
                <Button asChild variant="outline" className="glass gold-hairline text-cream">
                  <a href={p.tour_360_url} target="_blank" rel="noreferrer"><PlayCircle className="mr-1 h-4 w-4" /> 360° Tour</a>
                </Button>
              )}
            </div>

            {p.description && (
              <div className="glass rounded-2xl p-4 text-sm leading-relaxed text-cream/90">{p.description}</div>
            )}

            {p.amenities && p.amenities.length > 0 && (
              <div>
                <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Amenities</div>
                <div className="flex flex-wrap gap-1.5">
                  {p.amenities.map((a) => (
                    <span key={a.id} className="glass gold-hairline rounded-full px-3 py-1 text-xs text-cream">
                      {a.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">{icon} {label}</div>
      <div className="mt-1 truncate text-cream">{value}</div>
    </div>
  );
}

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Bath, Bed, Building2, FileDown, MapPin, Ruler } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { fetchProjectBySlug } from "@/hooks/use-projects";
import { UnitOfferDialog } from "@/components/offers/UnitOfferDialog";
import { Button } from "@/components/ui/button";
import { mediaSrc } from "@/lib/media";
import { formatAed, bedroomsLabel, positiveCount } from "@/lib/dubai";
import { areaLabel, unitDetailSlug } from "@/lib/unit-types";

export const Route = createFileRoute("/projects/$slug/units/$unitTypeId")({
  loader: async ({ params }) => {
    const project = await fetchProjectBySlug(params.slug);
    if (!project) throw notFound();
    const unit = project.unit_types.find((item) => item.id === params.unitTypeId || unitDetailSlug({
      projectName: project.name,
      projectSlug: project.slug,
      developerName: project.developer?.name,
      developerSlug: project.developer?.slug,
      unitLabel: item.label,
    }) === params.unitTypeId);
    if (!unit) throw notFound();
    return { project, unit };
  },
  head: ({ loaderData, params }) => {
    const project = loaderData?.project;
    const unit = loaderData?.unit;
    if (!project || !unit) return { meta: [{ title: `${params.unitTypeId} — Unit details` }] };
    const unitImage = mediaSrc(
      unit.images?.find((image) => !image.is_floor_plan)?.src ?? unit.images?.find((image) => image.is_floor_plan)?.src ?? unit.floor_plan_src,
      unit.images?.find((image) => !image.is_floor_plan)?.url ?? unit.images?.find((image) => image.is_floor_plan)?.url ?? unit.floor_plan_url,
    );
    return {
      meta: [
        { title: `${unit.label} — ${project.name} | Dubai Residences` },
        { name: "description", content: `${unit.label} details, images, area, and pricing in ${project.name}.` },
        ...(unitImage ? [{ property: "og:image", content: unitImage }] : []),
      ],
    };
  },
  component: UnitTypeDetail,
  errorComponent: ({ error }) => <div className="p-10 text-center text-muted-foreground">{error.message}</div>,
  notFoundComponent: () => <div className="p-10 text-center text-muted-foreground">Unit not found.</div>,
});

function UnitTypeDetail() {
  const { project, unit } = Route.useLoaderData();
  const unitImages = useMemo(() => {
    const rows = (unit.images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    return rows.map((image) => ({
      id: image.id,
      full: mediaSrc(image.src, image.url),
      thumb: mediaSrc(image.thumb_src, image.src ?? image.url),
      isFloorPlan: image.is_floor_plan,
    })).filter((image) => image.full);
  }, [unit.images]);
  const fallbackFloorPlan = mediaSrc(unit.floor_plan_src, unit.floor_plan_url);
  // The first normal unit photo is the unit page hero. The project image is
  // deliberately never included here; it belongs to the parent project page.
  const unitPhotos = unitImages.filter((image) => !image.isFloorPlan);
  const selectedFloorPlan = unitImages.find((image) => image.isFloorPlan) ?? (fallbackFloorPlan ? { id: "legacy-floor-plan", full: fallbackFloorPlan, thumb: fallbackFloorPlan, isFloorPlan: true } : null);
  const mainUnitImage = unitPhotos[0] ?? selectedFloorPlan;
  const gallery = [...unitPhotos, ...(selectedFloorPlan ? [selectedFloorPlan] : [])];
  const [activeImage, setActiveImage] = useState(mainUnitImage?.full ?? null);
  const [offerOpen, setOfferOpen] = useState(false);
  useEffect(() => setActiveImage(mainUnitImage?.full ?? null), [unit.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const beds = bedroomsLabel(project);
  const baths = positiveCount(project.bathrooms);

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-cream">
          <Link to="/projects/$slug" params={{ slug: project.slug }}><ArrowLeft className="mr-1 h-4 w-4" /> Back to project</Link>
        </Button>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            <div className="glass gold-hairline overflow-hidden rounded-3xl bg-white">
              {activeImage ? (
                <img src={activeImage} alt={`${unit.label} in ${project.name}`} className="h-[480px] w-full object-cover" loading="eager" decoding="async" />
              ) : (
                <div className="grid h-[480px] place-items-center bg-muted text-muted-foreground">No unit image</div>
              )}
            </div>
            {gallery.length > 1 && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Unit photos &amp; floor plan</div>
                  <div className="text-[10px] uppercase tracking-wider text-gold">Main photo first</div>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {gallery.map((image, index) => (
                    <button key={image.id} type="button" onClick={() => setActiveImage(image.full)} className={`group relative glass aspect-[4/3] overflow-hidden rounded-2xl ${activeImage === image.full ? "ring-2 ring-gold" : "gold-hairline"}`} aria-label={`Show ${image.isFloorPlan ? "floor plan" : "unit photo"}`}>
                      <img src={image.thumb} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" decoding="async" />
                      <span className="absolute inset-x-1 bottom-1 rounded bg-black/65 px-1.5 py-1 text-left text-[9px] uppercase tracking-wider text-white">
                        {image.isFloorPlan ? "Floor plan" : index === 0 ? "Main photo" : "Unit photo"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> Unit type inside {project.developer?.name ?? "Independent"}</div>
            <h1 className="font-display text-5xl leading-none text-cream">{unit.label}</h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4" /> {project.name} · {project.community?.name ?? project.address ?? "Dubai"}</p>

            <div className="glass-strong gold-hairline rounded-3xl p-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Unit details</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <DetailStat icon={<Ruler className="h-4 w-4" />} label="Area" value={areaLabel(unit) ?? "Not specified"} />
                {beds && <DetailStat icon={<Bed className="h-4 w-4" />} label="Bedrooms" value={beds} />}
                {baths != null && <DetailStat icon={<Bath className="h-4 w-4" />} label="Bathrooms" value={String(baths)} />}
                <DetailStat icon={<Building2 className="h-4 w-4" />} label="Status" value={project.status.replace(/_/g, " ")} />
              </div>
              <div className="mt-5 border-t border-border/50 pt-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Starting price</div>
                <div className="mt-1 font-display text-3xl text-gold-gradient">{formatAed(unit.price_aed)}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => setOfferOpen(true)} className="bg-gold text-gold-foreground hover:bg-gold/90"><FileDown className="mr-1 h-4 w-4" /> Sales offer PDF</Button>
                <Button asChild variant="outline" className="glass gold-hairline text-cream"><Link to="/projects/$slug" params={{ slug: project.slug }}>View full project</Link></Button>
              </div>
            </div>

            {unitImages.some((image) => image.isFloorPlan) && (
              <div className="rounded-2xl border border-gold/20 bg-gold/5 p-4 text-sm text-cream">
                The selected floor plan is marked in the unit gallery and is the image used in the sales offer PDF.
              </div>
            )}
          </div>
        </div>
      </div>
      <UnitOfferDialog project={project} initialUnitId={unit.id} open={offerOpen} onOpenChange={setOfferOpen} />
    </div>
  );
}

function DetailStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="glass rounded-xl p-3"><div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">{icon} {label}</div><div className="mt-1 truncate text-cream">{value}</div></div>;
}

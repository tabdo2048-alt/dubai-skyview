import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bath, Bed, Building2, FileDown, Ruler } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProjectWithRelations } from "@/lib/types";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { fetchProjectBySlug, useProject } from "@/hooks/use-projects";
import { UnitOfferDialog } from "@/components/offers/UnitOfferDialog";
import { Button } from "@/components/ui/button";
import { mediaSrc } from "@/lib/media";
import { formatAed, bedroomsLabel, positiveCount } from "@/lib/dubai";
import { areaLabel, projectDetailSlug, unitDetailSlug } from "@/lib/unit-types";
import { displayPaymentPlans } from "@/lib/payment-plans";

function findUnitForRoute(project: ProjectWithRelations | null | undefined, unitTypeId: string) {
  if (!project) return null;
  return project.unit_types.find((item) => item.id === unitTypeId || unitDetailSlug({
    projectName: project.name,
    projectSlug: project.slug,
    developerName: project.developer?.name,
    developerSlug: project.developer?.slug,
    unitLabel: item.label,
  }) === unitTypeId) ?? null;
}

export const Route = createFileRoute("/projects/$slug/units/$unitTypeId")({
  loader: async ({ params }) => {
    const project = await fetchProjectBySlug(params.slug);
    // A server render may not have the browser's Supabase session yet. Keep the
    // route alive so the client can retry with the logged-in user's session.
    return { project };
  },
  head: ({ loaderData, params }) => {
    const project = loaderData?.project;
    const unit = findUnitForRoute(project, params.unitTypeId);
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
  const loaderData = Route.useLoaderData();
  const { slug, unitTypeId } = Route.useParams();
  const clientProject = useProject(slug);
  const project = clientProject.data ?? loaderData.project;
  const unit = useMemo(() => findUnitForRoute(project, unitTypeId), [project, unitTypeId]);

  // Keep every hook above the loading/not-found return. The project can be
  // unavailable during the first client render while the authenticated query
  // is being retried, so conditional hooks here would break the route exactly
  // when it is recovering from that state.
  const unitImages = useMemo(() => {
    if (!unit) return [];
    const rows = (unit.images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const images = rows.map((image) => ({
      id: image.id,
      full: mediaSrc(image.src, image.url),
      thumb: mediaSrc(image.thumb_src, image.src ?? image.url),
      isFloorPlan: image.is_floor_plan,
    })).filter((image) => image.full);
    const fallbackFloorPlan = mediaSrc(unit.floor_plan_src, unit.floor_plan_url);
    if (fallbackFloorPlan && !images.some((image) => image.isFloorPlan)) {
      images.push({ id: "legacy-floor-plan", full: fallbackFloorPlan, thumb: fallbackFloorPlan, isFloorPlan: true });
    }
    return images;
  }, [unit]);
  // The first normal unit photo is the unit page hero. The project image is
  // deliberately never included here; it belongs to the parent project page.
  const unitPhotos = unitImages.filter((image) => !image.isFloorPlan);
  const selectedFloorPlan = unitImages.find((image) => image.isFloorPlan) ?? null;
  const mainUnitImage = unitPhotos[0] ?? null;
  const gallery = [...unitPhotos, ...(selectedFloorPlan ? [selectedFloorPlan] : [])];
  const [activeImage, setActiveImage] = useState(mainUnitImage?.full ?? null);
  const [offerOpen, setOfferOpen] = useState(false);
  const activeIsFloorPlan = gallery.find((image) => image.full === activeImage)?.isFloorPlan ?? false;
  const paymentPlans = useMemo(() => displayPaymentPlans(project?.payment_plans, project?.payment_plan), [project?.payment_plan, project?.payment_plans]);
  useEffect(() => setActiveImage(mainUnitImage?.full ?? null), [unit?.id, mainUnitImage?.full]);

  if (!project || !unit) {
    return (
      <div className="min-h-screen">
        <AppNavbar />
        <div className="grid min-h-[60vh] place-items-center px-4 text-center">
          <div>
            <div className="text-sm text-muted-foreground">{clientProject.isLoading ? "Loading unit details…" : "Unit not found."}</div>
            {!clientProject.isLoading && <Link to="/" className="mt-3 inline-block text-sm text-gold underline-offset-4 hover:underline">Back to projects</Link>}
          </div>
        </div>
      </div>
    );
  }
  const beds = bedroomsLabel(project);
  const baths = positiveCount(project.bathrooms);

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-cream">
          <Link to="/projects/$slug" params={{ slug: projectDetailSlug({ name: project.name, slug: project.slug }) }}><ArrowLeft className="mr-1 h-4 w-4" /> Back to project</Link>
        </Button>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            <div className="glass gold-hairline overflow-hidden rounded-3xl bg-white">
              {activeImage ? (
                <img src={activeImage} alt={`${unit.label} in ${project.name}`} className={`h-[480px] w-full ${activeIsFloorPlan ? "bg-white object-contain" : "object-cover"}`} loading="eager" decoding="async" />
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
                      <img src={image.thumb} alt="" className={`h-full w-full ${image.isFloorPlan ? "bg-white object-contain" : "object-cover transition-transform group-hover:scale-105"}`} loading="lazy" decoding="async" />
                      <span className="absolute inset-x-1 bottom-1 rounded bg-black/65 px-1.5 py-1 text-left text-[9px] uppercase tracking-wider text-white">
                        {image.isFloorPlan ? "Floor plan" : index === 0 ? "Main photo" : "Unit photo"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedFloorPlan && (
              <div className="glass gold-hairline overflow-hidden rounded-3xl bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-ink">Floor plan</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected unit layout</div>
                </div>
                <img
                  src={selectedFloorPlan.full}
                  alt={`${unit.label} floor plan`}
                  className="h-[300px] w-full object-contain p-2"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> Unit details</div>
            <h1 className="font-display text-5xl leading-none text-cream">{unit.label}</h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="h-4 w-4" /> {project.developer?.name ?? "Independent developer"}</p>

            <div className="glass gold-hairline rounded-3xl p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gold">Developer</div>
                  <div className="mt-1 text-sm font-semibold text-white">{project.developer?.name ?? "Independent"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gold">Main project</div>
                  <Link to="/projects/$slug" params={{ slug: projectDetailSlug({ name: project.name, slug: project.slug }) }} className="mt-1 block truncate text-sm font-semibold text-white underline-offset-4 hover:text-gold hover:underline">
                    {project.name}
                  </Link>
                </div>
              </div>
            </div>

            <div className="glass-strong gold-hairline rounded-3xl p-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Unit details</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <DetailStat icon={<Ruler className="h-4 w-4" />} label="Area" value={areaLabel(unit) ?? "Not specified"} />
                {unit.floor && <DetailStat emphasis icon={<Building2 className="h-4 w-4" />} label="Floor" value={unit.floor} />}
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
                <Button asChild variant="outline" className="glass gold-hairline text-cream"><Link to="/projects/$slug" params={{ slug: projectDetailSlug({ name: project.name, slug: project.slug }) }}>View full project</Link></Button>
              </div>
            </div>

            <PaymentPlans plans={paymentPlans} />

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

function PaymentPlans({ plans }: { plans: ReturnType<typeof displayPaymentPlans> }) {
  return (
    <div className="glass-strong gold-hairline rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-gold">Available payment plans</div>
          <div className="mt-1 text-sm text-muted-foreground">Plans configured for this project</div>
        </div>
        <div className="rounded-full border border-gold/30 px-2.5 py-1 text-[10px] uppercase tracking-wider text-gold">{plans.length} {plans.length === 1 ? "plan" : "plans"}</div>
      </div>
      {plans.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border/60 p-3 text-sm text-muted-foreground">No payment plan configured.</div>
      ) : (
        <div className="mt-4 space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-2xl bg-black/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-white">{plan.label}</div>
                {plan.is_default && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">Default</span>}
              </div>
              {plan.details && <div className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{plan.details}</div>}
              {plan.installments.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
                  {plan.installments.map((installment) => (
                    <div key={installment.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-cream">{installment.label}</span>
                      <span className="shrink-0 text-gold">{installment.percentage}%{installment.due_label ? ` · ${installment.due_label}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailStat({ icon, label, value, emphasis = false }: { icon: React.ReactNode; label: string; value: string; emphasis?: boolean }) {
  return <div className="glass rounded-xl p-3"><div className={`flex items-center gap-1 text-[10px] uppercase tracking-widest ${emphasis ? "text-gold" : "text-muted-foreground"}`}>{icon} {label}</div><div className={`mt-1 truncate ${emphasis ? "font-semibold text-white" : "text-cream"}`}>{value}</div></div>;
}

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Bath, Bed, Building2, FileDown, Ruler, MessageCircle, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { whatsappUrl } from "@/lib/contact";
import { UnitGallery } from "@/components/units/UnitGallery";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { fetchProjectBySlug, useProject } from "@/hooks/use-projects";
import { UnitOfferDialog } from "@/components/offers/UnitOfferDialog";
import { Button } from "@/components/ui/button";
import { mediaSrc } from "@/lib/media";
import { formatAed } from "@/lib/dubai";
import { areaLabel, projectDetailSlug, findUnitForRoute, canOfferUnit, unitAvailabilityLabel } from "@/lib/unit-types";
import { formatCurrency, calculateInstallmentAmount } from "@/lib/offer-calculations";
import { displayPaymentPlans } from "@/lib/payment-plans";

export const Route = createFileRoute("/projects/$slug/units/$unitTypeId")({
  loader: async ({ params }) => {
    const project = await fetchProjectBySlug(params.slug);
    if (project && !findUnitForRoute(project, params.unitTypeId)) throw notFound();
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
        { name: "description", content: `${unit.label} in ${project.name} · ${formatAed(unit.price_aed)} · ${areaLabel(unit) ?? "Contact for area"}` },
        { property: "og:title", content: `${unit.label} — ${project.name}` },
        { property: "og:description", content: `${formatAed(unit.price_aed)} · ${areaLabel(unit) ?? "Contact for area"} · ${unitAvailabilityLabel(unit)}` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
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

  const [offerOpen, setOfferOpen] = useState(false);
  const paymentPlans = useMemo(() => displayPaymentPlans(project?.payment_plans, project?.payment_plan), [project?.payment_plan, project?.payment_plans]);

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
  const beds = unit.bedrooms == null ? null : unit.bedrooms === 0 ? "Studio" : String(unit.bedrooms);
  const baths = unit.bathrooms;
  const inquiryUrl = whatsappUrl(`${project.name} — ${unit.label}`);

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-cream">
          <Link to="/projects/$slug" params={{ slug: projectDetailSlug({ name: project.name, slug: project.slug }) }}><ArrowLeft className="mr-1 h-4 w-4" /> Back to project</Link>
        </Button>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <UnitGallery key={unit.id} unit={unit} projectName={project.name} />

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
                <DetailStat icon={<Building2 className="h-4 w-4" />} label="Availability" value={unitAvailabilityLabel(unit)} />
                {unit.view_description && <DetailStat icon={<Building2 className="h-4 w-4" />} label="View" value={unit.view_description} />}
              </div>
              <div className="mt-5 border-t border-border/50 pt-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Starting price</div>
                <div className="mt-1 font-display text-3xl text-gold-gradient">{formatAed(unit.price_aed)}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" disabled={!canOfferUnit(unit)} onClick={() => setOfferOpen(true)} className="bg-gold text-gold-foreground hover:bg-gold/90"><FileDown className="mr-1 h-4 w-4" /> Sales offer PDF</Button>
                <Button asChild variant="outline" className="glass gold-hairline text-cream"><Link to="/projects/$slug" params={{ slug: projectDetailSlug({ name: project.name, slug: project.slug }) }}>View full project</Link></Button>
              </div>
            </div>

            <PaymentPlans plans={paymentPlans} price={unit.price_aed} />
            <div className="flex flex-wrap gap-2">
              {inquiryUrl && <Button asChild variant="outline"><a href={inquiryUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4" /> Ask about this unit</a></Button>}
              <Button variant="outline" onClick={async () => {
                const url = `${window.location.origin}/projects/${encodeURIComponent(slug)}/units/${encodeURIComponent(unit.id)}`;
                try { await navigator.clipboard.writeText(url); toast.success("Unit link copied"); } catch { toast.error("Could not copy. Copy the address from your browser."); }
              }}><Share2 className="mr-2 h-4 w-4" /> Copy unit link</Button>
            </div>
            {unit.availability === "sold" && <p className="text-sm text-muted-foreground">This unit is sold. Sales offers are unavailable.</p>}


          </div>
        </div>
      </div>
      <UnitOfferDialog project={project} initialUnitId={unit.id} lockUnitSelection open={offerOpen} onOpenChange={setOfferOpen} />
    </div>
  );
}

function PaymentPlans({ plans, price }: { plans: ReturnType<typeof displayPaymentPlans>; price: number | null }) {
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
                  {plan.installments.filter(installment => installment.percentage > 0).map((installment) => (
                    <div key={installment.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-cream">{installment.label}</span>
                      <span className="shrink-0 text-gold">{installment.percentage}%{price != null && price > 0 ? ` · ${formatCurrency(calculateInstallmentAmount(price, installment.percentage))}` : ""}{installment.due_label ? ` · ${installment.due_label}` : ""}</span>
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

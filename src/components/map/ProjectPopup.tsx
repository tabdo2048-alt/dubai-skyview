import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Bed, Calendar, Wallet, Building2, ArrowRight, MessageCircle, CalendarCheck, Ruler, FileDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ProjectWithRelations } from "@/lib/types";
import { formatAed, bedroomsLabel } from "@/lib/dubai";
import { whatsappUrl, viewingMailto } from "@/lib/contact";
import { track } from "@/lib/analytics";
import { mediaSrc } from "@/lib/media";
import { areaLabel, displayUnitTypes, pricedUnitTypes, projectDetailSlug, unitDetailSlug } from "@/lib/unit-types";
import { displayPaymentPlans, paymentPlanSummary } from "@/lib/payment-plans";
import { Button } from "@/components/ui/button";
import { UnitOfferDialog } from "@/components/offers/UnitOfferDialog";

export function ProjectPopup({ project, onClose }: { project: ProjectWithRelations | null; onClose: () => void }) {
  // Hero + gallery images (hero first, deduped) for the click-to-swap viewer.
  const images = useMemo(() => {
    // Signed URLs (private media bucket) — fall back to the stored value for
    // rows whose image lives on an external host.
    const urls: Array<{ full: string; thumb: string }> = [];
    // The map list intentionally contains only the small main thumbnail. The
    // detail page is where the full-resolution image is fetched.
    const hero = mediaSrc(project?.main_image_thumb_src, project?.main_image_src ?? project?.main_image_url);
    const heroThumb = hero;
    if (hero) urls.push({ full: hero, thumb: heroThumb || hero });
    for (const g of project?.images ?? []) {
      const full = mediaSrc(g?.src, g?.url);
      const thumb = mediaSrc(g?.thumb_src, g?.src ?? g?.url);
      if (full && !urls.some((item) => item.full === full)) urls.push({ full, thumb: thumb || full });
    }
    return urls;
  }, [project]);
  const [activeImage, setActiveImage] = useState<string | null>(images[0]?.full ?? null);
  const unitTypes = useMemo(() => displayUnitTypes(project?.unit_types, project?.starting_price_aed), [project]);
  const unitRows = unitTypes.filter((item) => item.id !== "legacy-starting-price");
  const priceRows = pricedUnitTypes(unitTypes);
  const areaRows = unitTypes.filter((item) => areaLabel(item));
  const paymentPlans = useMemo(() => displayPaymentPlans(project?.payment_plans, project?.payment_plan), [project]);
  const bedrooms = project ? bedroomsLabel(project) : null;
  const whatsapp = project ? whatsappUrl(project.name) : null;
  const mailto = project ? viewingMailto(project.name) : null;
  const [offerOpen, setOfferOpen] = useState(false);
  // Reset the hero when a different project is selected.
  useEffect(() => setActiveImage(images[0]?.full ?? null), [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Close on Escape.
  useEffect(() => {
    if (!project) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project, onClose]);

  return (
    <AnimatePresence>
      {project && (
        <>
          {/* Click-outside backdrop — closes the popup without dimming the map. */}
          <motion.div
            key="popup-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="pointer-events-auto absolute inset-0 z-10"
            aria-hidden
          />
          {/* Positioning wrapper (static transform) is separate from the animated
              card so Tailwind's centering translate never clashes with framer's
              transform. Mobile: bottom-center sheet. md+: right-side panel. */}
          {/* Docked bottom-right on md+ so it never overlaps the top-right
              Layers/Places controls (which stay usable while the popup is open).
              Mobile: bottom-center sheet. */}
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 md:left-auto md:right-28 md:w-[370px] md:max-w-[calc(100vw-2rem)] md:-translate-x-0">
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            whileHover={{ y: -3 }}
            className="no-scrollbar pointer-events-auto md:max-h-[calc(100vh-9rem)] md:overflow-y-auto"
          >
            <div className="glass-liquid gold-hairline overflow-hidden rounded-3xl shadow-2xl">
              <div className="relative h-40 w-full overflow-hidden">
                {activeImage ? (
                  <img
                    key={activeImage}
                    src={activeImage}
                    alt={project.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/25 to-transparent" />
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="glass absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-cream transition-colors hover:text-gold"
                >
                  <X className="h-4 w-4" />
                </button>
                {project.featured && (
                  <span className="glass gold-hairline absolute left-3 top-3 rounded-full px-3 py-1 text-xs uppercase tracking-widest text-gold">
                    Featured
                  </span>
                )}
                {/* Price anchored on the hero — clears the header for the name. */}
              </div>

              <div className="space-y-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="truncate">{project.developer?.name ?? "Independent"}</span>
                  </div>
                  <h3 className="font-display text-lg leading-tight text-cream">{project.name}</h3>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{project.community?.name ?? project.address ?? "Dubai"}</span>
                  </div>
                </div>

                {/* Thumbnail strip — click to swap the hero (mirrors the detail page). */}
                {(unitRows.length > 0 || priceRows.length > 0) && (
                  <div className="glass gold-hairline rounded-2xl p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Prices by unit type</div>
                    <div className="space-y-1.5 text-sm">
                  {(unitRows.length > 0 ? unitRows : priceRows).slice(0, 4).map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3">
                          {item.id === "legacy-starting-price" ? (
                            <span className="font-medium text-cream">{item.label}</span>
                          ) : (
                            <Link to="/projects/$slug/units/$unitTypeId" params={{ slug: projectDetailSlug({ name: project.name, slug: project.slug }), unitTypeId: unitDetailSlug({ projectName: project.name, projectSlug: project.slug, developerName: project.developer?.name, developerSlug: project.developer?.slug, unitLabel: item.label }) }} className="font-medium text-cream underline-offset-4 hover:text-gold hover:underline">
                              {item.label}
                            </Link>
                          )}
                          <span className="text-right text-gold-gradient">{item.price_aed != null && item.price_aed > 0 ? formatAed(item.price_aed) : "Price on request"}</span>
                        </div>
                      ))}
                    </div>
                    {(unitRows.length > 4 || priceRows.length > 4) && <div className="mt-2 text-[11px] text-muted-foreground">+{(unitRows.length > 0 ? unitRows.length : priceRows.length) - 4} more unit types</div>}
                  </div>
                )}

                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-0.5">
                    {images.map(({ full, thumb }) => (
                      <button
                        key={full}
                        type="button"
                        onClick={() => setActiveImage(full)}
                        aria-current={full === activeImage}
                        aria-label="Show image"
                        className={`h-10 w-14 shrink-0 overflow-hidden rounded-lg transition ${
                          full === activeImage ? "ring-2 ring-gold" : "gold-hairline opacity-80 hover:opacity-100"
                        }`}
                      >
                        <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      </button>
                    ))}
                  </div>
                )}

                {project.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
                )}

                {/* auto-fit rather than a fixed 3 columns: a stat with no value is
                    dropped entirely (see bedroomsLabel), so the survivors have to
                    fill the row instead of leaving a hole. */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2 text-xs">
                  {bedrooms && <Stat icon={<Bed className="h-3.5 w-3.5" />} label="Bedrooms" value={bedrooms} />}
                  <Stat icon={<Calendar className="h-3.5 w-3.5" />} label="Handover" value={project.completion_date ?? "TBA"} />
                  <Stat icon={<Wallet className="h-3.5 w-3.5" />} label="Payment" value={paymentPlanSummary(paymentPlans)} />
                </div>

                {/* Always expanded — the size is a headline number buyers compare
                    on, so it does not sit behind a disclosure button. */}
                {areaRows.length > 0 && (
                  <div className="glass gold-hairline rounded-2xl p-3">
                    <div className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                      <Ruler className="h-3 w-3" /> Area
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {areaRows.map((item) => (
                        <div key={item.id} className="flex justify-between gap-3 text-cream">
                          <span>{item.label}</span>
                          <span className="text-muted-foreground">{areaLabel(item)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {project.amenities && project.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {project.amenities.slice(0, 5).map((a) => (
                      <span key={a.id} className="glass rounded-full px-2.5 py-1 text-xs text-cream/90">
                        {a.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm" className="shimmer bg-gold text-gold-foreground shadow-[0_0_0_rgba(201,168,76,0)] transition-shadow hover:bg-gold/90 hover:shadow-[0_6px_22px_rgba(201,168,76,0.45)]">
                    <Link to="/projects/$slug" params={{ slug: projectDetailSlug({ name: project.name, slug: project.slug }) }}>
                      View details <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {priceRows.length > 0 && (
                    <Button type="button" size="sm" variant="outline" className="glass gold-hairline text-cream" onClick={() => setOfferOpen(true)}>
                      <FileDown className="mr-1 h-3.5 w-3.5" /> Sales offer
                    </Button>
                  )}
                  {/* Both CTAs render only when configured, and both now report the
                      conversion — these two were the only lead buttons in the app
                      firing no analytics at all, so demand from the map popup was
                      invisible while the detail page's identical buttons counted. */}
                  {whatsapp && (
                    <Button asChild size="sm" variant="outline" className="glass gold-hairline text-cream">
                      <a href={whatsapp} target="_blank" rel="noreferrer"
                         onClick={() => track("lead_whatsapp", { slug: project.slug, name: project.name })}>
                        <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
                      </a>
                    </Button>
                  )}
                  {mailto && (
                    <Button asChild size="sm" variant="outline" className="glass gold-hairline text-cream">
                      <a href={mailto}
                         onClick={() => track("lead_book_viewing", { slug: project.slug, name: project.name })}>
                        <CalendarCheck className="mr-1 h-3.5 w-3.5" /> Book viewing
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
          </div>
        </>
      )}
      {project && <UnitOfferDialog project={project} open={offerOpen} onOpenChange={setOfferOpen} />}
    </AnimatePresence>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 truncate text-sm text-cream">{value}</div>
    </div>
  );
}

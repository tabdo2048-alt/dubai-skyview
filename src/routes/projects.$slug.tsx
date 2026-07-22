import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  MapPin,
  Bed,
  Bath,
  Calendar,
  Wallet,
  Building2,
  MessageCircle,
  CalendarCheck,
  Download,
  PlayCircle,
  Tag,
} from "lucide-react";
import { useEffect } from "react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { fetchProjectBySlug } from "@/hooks/use-projects";
import { formatAed } from "@/lib/dubai";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import type { ProjectWithRelations } from "@/lib/types";

export const Route = createFileRoute("/projects/$slug")({
  // Fetch on the server so <head> SEO tags + structured data are built from real
  // project data (name, price, image) instead of the raw slug.
  loader: async ({ params }) => ({ project: await fetchProjectBySlug(params.slug) }),
  head: ({ loaderData, params }) => {
    const p = loaderData?.project;
    if (!p) {
      return {
        meta: [
          { title: `${params.slug} — Dubai Residences` },
          { name: "description", content: `Details, gallery, and pricing for ${params.slug} in Dubai.` },
        ],
      };
    }
    const price = formatAed(p.starting_price_aed);
    const area = p.community?.name ?? p.address ?? "Dubai";
    const title = `${p.name} — ${area} | Dubai Residences`;
    const description =
      p.description?.slice(0, 155) ??
      `${p.name} by ${p.developer?.name ?? "a leading developer"} in ${area}. Starting from ${price}. ${bedroomsLabel(p)} bedrooms.`;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (p.tags?.length) meta.push({ name: "keywords", content: p.tags.join(", ") });
    if (p.main_image_url) {
      meta.push({ property: "og:image", content: p.main_image_url });
      meta.push({ name: "twitter:image", content: p.main_image_url });
    }
    return {
      meta,
      scripts: [{ type: "application/ld+json", children: JSON.stringify(buildListingJsonLd(p)) }],
    };
  },
  component: ProjectDetail,
  errorComponent: ({ error }) => <div className="p-10 text-center text-muted-foreground">{error.message}</div>,
  notFoundComponent: () => <div className="p-10 text-center text-muted-foreground">Project not found.</div>,
});

function ProjectDetail() {
  const { project: p } = Route.useLoaderData();
  useEffect(() => {
    if (p) track("view_project", { slug: p.slug, name: p.name, price: p.starting_price_aed });
  }, [p]);
  if (!p) throw notFound();

  const gallery = p.images ?? [];

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
              {p.main_image_url ? (
                <img
                  src={p.main_image_url}
                  alt={p.name}
                  className="h-[420px] w-full object-cover"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
              ) : (
                <div className="grid h-[420px] w-full place-items-center bg-muted text-muted-foreground">
                  No image
                </div>
              )}
            </div>

            {/* Gallery & floor plans */}
            {gallery.length > 0 && (
              <div>
                <div className="mb-2 mt-4 text-xs uppercase tracking-widest text-muted-foreground">
                  Gallery &amp; floor plans
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {gallery.map((img) => (
                    <div key={img.id} className="glass gold-hairline aspect-[4/3] overflow-hidden rounded-2xl">
                      <img
                        src={img.url}
                        alt={p.name}
                        className="h-full w-full object-cover transition-transform hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                <Info icon={<Bed className="h-4 w-4" />} label="Bedrooms" value={bedroomsLabel(p)} />
                <Info icon={<Bath className="h-4 w-4" />} label="Bathrooms" value={String(p.bathrooms ?? "—")} />
                <Info icon={<Calendar className="h-4 w-4" />} label="Handover" value={p.completion_date ?? "TBA"} />
                <Info icon={<Wallet className="h-4 w-4" />} label="Payment plan" value={p.payment_plan ?? "Flexible"} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-gold text-gold-foreground hover:bg-gold/90">
                <a
                  href={`https://wa.me/971500000000?text=${encodeURIComponent(`Interested in ${p.name}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track("lead_whatsapp", { slug: p.slug, name: p.name })}
                >
                  <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" className="glass gold-hairline text-cream">
                <a
                  href={`mailto:sales@example.ae?subject=${encodeURIComponent(`Book viewing: ${p.name}`)}`}
                  onClick={() => track("lead_book_viewing", { slug: p.slug, name: p.name })}
                >
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
              {p.video_url && (
                <Button asChild variant="outline" className="glass gold-hairline text-cream">
                  <a href={p.video_url} target="_blank" rel="noreferrer"><PlayCircle className="mr-1 h-4 w-4" /> Video</a>
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

            {p.tags && p.tags.length > 0 && (
              <div>
                <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Highlights</div>
                <div className="flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span key={t} className="glass rounded-full px-2.5 py-1 text-xs capitalize text-cream/90">
                      <Tag className="mr-1 inline h-3 w-3" />
                      {t.replace(/-/g, " ")}
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

function bedroomsLabel(p: ProjectWithRelations) {
  const a = p.bedrooms_min;
  const b = p.bedrooms_max;
  if (a == null && b == null) return "—";
  if (b == null || a === b) return String(a ?? b);
  if (a == null) return String(b);
  return `${a}–${b}`;
}

// schema.org structured data — helps search engines render a rich listing.
function buildListingJsonLd(p: ProjectWithRelations) {
  return {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: p.name,
    description: p.description ?? undefined,
    image: p.main_image_url ?? undefined,
    numberOfBedrooms: p.bedrooms_min ?? undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: p.community?.name ?? "Dubai",
      addressRegion: "Dubai",
      addressCountry: "AE",
    },
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    ...(p.starting_price_aed
      ? {
          offers: {
            "@type": "Offer",
            price: p.starting_price_aed,
            priceCurrency: "AED",
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">{icon} {label}</div>
      <div className="mt-1 truncate text-cream">{value}</div>
    </div>
  );
}

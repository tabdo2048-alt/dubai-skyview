import { useEffect, useId, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, ExternalLink, Info, PlayCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAed } from "@/lib/dubai";
import type { TourHotspotRow } from "./types";
import {
  hotspotExternalUrl,
  hotspotImageUrl,
  hotspotMetadataText,
  hotspotUnitTypeId,
} from "./hotspotData";
import { useFirstPublishedUnitTour, useTourUnitSummary } from "./queries";

interface TourHotspotCardProps {
  hotspot: TourHotspotRow;
  projectId: string;
  projectSlug: string;
  onClose: () => void;
  onOpenUnitTour: (tourId: string) => void;
}

export function TourHotspotCard({
  hotspot,
  projectId,
  projectSlug,
  onClose,
  onOpenUnitTour,
}: TourHotspotCardProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const title =
    hotspotMetadataText(hotspot.metadata, "title") ??
    hotspot.label ??
    (hotspot.type === "unit" ? "Unit" : "Information");
  const description = hotspotMetadataText(hotspot.metadata, "description");
  const extra = hotspotMetadataText(hotspot.metadata, "extra");
  const imageUrl = hotspotImageUrl(hotspot.metadata);
  const externalUrl = hotspotExternalUrl(hotspot.metadata);
  const unitTypeId = hotspotUnitTypeId(hotspot.metadata);
  const unitTour = useFirstPublishedUnitTour(projectId, unitTypeId);
  const unitTourId = unitTour.data?.id ?? null;
  const unitSummary = useTourUnitSummary(projectId, unitTypeId);
  const area = unitSummary.data
    ? unitSummary.data.area_sqm_min === unitSummary.data.area_sqm_max
      ? unitSummary.data.area_sqm_min
      : (unitSummary.data.area_sqm_min ?? unitSummary.data.area_sqm_max)
    : null;

  useEffect(() => {
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const Icon =
    hotspot.type === "unit"
      ? Building2
      : hotspot.type === "amenity"
        ? Sparkles
        : hotspot.type === "external_link"
          ? ExternalLink
          : Info;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="glass-strong gold-hairline absolute bottom-24 left-3 z-50 w-[min(23rem,calc(100%-1.5rem))] overflow-hidden rounded-2xl bg-black/85 shadow-2xl backdrop-blur-xl lg:bottom-6 lg:left-6"
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="h-36 w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-xl text-cream">
              {title}
            </h2>
            {description && <p className="mt-2 text-sm leading-6 text-cream/75">{description}</p>}
            {extra && <p className="mt-2 text-xs text-muted-foreground">{extra}</p>}
          </div>
          <Button
            ref={closeRef}
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="h-9 w-9 shrink-0 text-cream"
            aria-label="Close information"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        {hotspot.type === "unit" && unitTypeId && (
          <div className="mt-4 grid gap-2">
            {unitSummary.data && (
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-cream/75">
                <div className="col-span-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
                  <span className="font-medium text-cream">{unitSummary.data.label}</span>
                  <span className="text-gold">{formatAed(unitSummary.data.price_aed)}</span>
                </div>
                {unitSummary.data.floor && <span>Floor: {unitSummary.data.floor}</span>}
                {unitSummary.data.bedrooms != null && (
                  <span>{unitSummary.data.bedrooms || "Studio"} Beds</span>
                )}
                {unitSummary.data.bathrooms != null && (
                  <span>{unitSummary.data.bathrooms} Baths</span>
                )}
                {area != null && <span>{area.toLocaleString()} m²</span>}
                <span className="capitalize">{unitSummary.data.availability}</span>
                {unitSummary.data.view_description && (
                  <span className="col-span-2 text-cream/60">
                    {unitSummary.data.view_description}
                  </span>
                )}
              </div>
            )}
            {unitTourId && (
              <Button
                type="button"
                onClick={() => onOpenUnitTour(unitTourId)}
                className="w-full bg-gold text-gold-foreground hover:bg-gold/90"
              >
                <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                استكشف الوحدة 360°
              </Button>
            )}
            <Button asChild variant={unitTourId ? "outline" : "default"} className="w-full">
              <Link
                to="/projects/$slug/units/$unitTypeId"
                params={{ slug: projectSlug, unitTypeId }}
              >
                View Unit
              </Link>
            </Button>
          </div>
        )}
        {hotspot.type === "external_link" && externalUrl && (
          <Button asChild variant="outline" className="mt-4 w-full">
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              Open Link
              <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>
    </aside>
  );
}

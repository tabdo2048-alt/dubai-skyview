import { useEffect, useId, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, ExternalLink, Info, PlayCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TourHotspotRow } from "./types";
import {
  hotspotExternalUrl,
  hotspotImageUrl,
  hotspotMetadataText,
  hotspotUnitTypeId,
} from "./hotspotData";
import { useFirstPublishedUnitTour } from "./queries";

interface TourHotspotCardProps {
  hotspot: TourHotspotRow;
  projectId: string;
  projectSlug: string;
  onClose: () => void;
}

export function TourHotspotCard({
  hotspot,
  projectId,
  projectSlug,
  onClose,
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
            {unitTour.data && (
              <Button asChild className="w-full bg-gold text-gold-foreground hover:bg-gold/90">
                <Link
                  to="/projects/$slug/tour/$tourId"
                  params={{ slug: projectSlug, tourId: unitTour.data.id }}
                >
                  <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                  استكشف الوحدة 360°
                </Link>
              </Button>
            )}
            <Button asChild variant={unitTour.data ? "outline" : "default"} className="w-full">
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

import { ArrowLeft, Building2, Maximize2, Share2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

interface TourControlsProps {
  slug: string;
  projectName: string;
  tourName: string;
  contextName?: string | null;
  parentTour?: { id: string; label: string } | null;
  fullscreenSupported: boolean;
  onFullscreen: () => void;
  onShare: () => void;
}
export function TourControls({
  slug,
  projectName,
  tourName,
  contextName,
  parentTour,
  fullscreenSupported,
  onFullscreen,
  onShare,
}: TourControlsProps) {
  return (
    <header className="absolute inset-x-0 top-0 z-40 flex items-center gap-3 bg-gradient-to-b from-black/85 to-transparent px-3 pb-10 pt-3 sm:px-5">
      <Button
        asChild
        size="sm"
        variant="ghost"
        className="shrink-0 text-cream hover:bg-white/10 hover:text-gold"
      >
        <Link to="/projects/$slug" params={{ slug }} aria-label={`Back to ${projectName}`}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Back
        </Link>
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-cream">{projectName}</div>
        <div className="truncate text-xs text-cream/65">
          {tourName}
          {contextName ? ` · ${contextName}` : ""}
        </div>
      </div>
      {parentTour && (
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="shrink-0 text-cream hover:bg-white/10 hover:text-gold"
        >
          <Link
            to="/projects/$slug/tour/$tourId"
            params={{ slug, tourId: parentTour.id }}
            aria-label={parentTour.label}
          >
            <Building2 className="h-4 w-4 sm:mr-1" aria-hidden="true" />
            <span className="hidden sm:inline">{parentTour.label}</span>
          </Link>
        </Button>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onShare}
        className="text-cream hover:bg-white/10 hover:text-gold"
        aria-label="Share this tour scene"
      >
        <Share2 className="h-5 w-5" aria-hidden="true" />
      </Button>
      {fullscreenSupported && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onFullscreen}
          className="text-cream hover:bg-white/10 hover:text-gold"
          aria-label="Toggle fullscreen"
        >
          <Maximize2 className="h-5 w-5" aria-hidden="true" />
        </Button>
      )}
    </header>
  );
}

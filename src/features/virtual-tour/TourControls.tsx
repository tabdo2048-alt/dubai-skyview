import { ArrowLeft, Maximize2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

interface TourControlsProps {
  slug: string;
  projectName: string;
  tourName: string;
  fullscreenSupported: boolean;
  onFullscreen: () => void;
}
export function TourControls({
  slug,
  projectName,
  tourName,
  fullscreenSupported,
  onFullscreen,
}: TourControlsProps) {
  return (
    <header className="absolute inset-x-0 top-0 z-40 flex items-center gap-3 bg-gradient-to-b from-black/85 to-transparent px-3 pb-10 pt-3 sm:px-5">
      <Button asChild size="sm" variant="ghost" className="shrink-0 text-cream hover:bg-white/10 hover:text-gold">
        <Link to="/projects/$slug" params={{ slug }} aria-label={`Back to ${projectName}`}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Back
        </Link>
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-cream">{projectName}</div>
        <div className="truncate text-xs text-cream/65">{tourName}</div>
      </div>
      {fullscreenSupported && (
        <Button type="button" size="icon" variant="ghost" onClick={onFullscreen} className="text-cream hover:bg-white/10 hover:text-gold" aria-label="Toggle fullscreen">
          <Maximize2 className="h-5 w-5" aria-hidden="true" />
        </Button>
      )}
    </header>
  );
}

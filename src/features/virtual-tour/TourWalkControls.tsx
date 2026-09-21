import { ArrowLeft, ArrowRight, Footprints } from "lucide-react";
import type { TourSceneRow } from "./types";

interface TourWalkControlsProps {
  backward: TourSceneRow | null;
  forward: TourSceneRow | null;
  onNavigate: (sceneId: string) => void;
}

const buttonClass =
  "flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium text-cream transition hover:bg-white/10 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-35";

export function TourWalkControls({ backward, forward, onNavigate }: TourWalkControlsProps) {
  if (!backward && !forward) return null;

  return (
    <nav
      className="absolute bottom-[calc(30vh+0.75rem)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-black/65 p-1 shadow-xl backdrop-blur-xl lg:bottom-5"
      aria-label="Walk through the tour"
    >
      <button
        type="button"
        className={buttonClass}
        disabled={!backward}
        onClick={() => backward && onNavigate(backward.id)}
        aria-label={backward ? `ارجع إلى ${backward.name}` : "لا يوجد مشهد خلفي"}
        title={backward?.name}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{backward?.name ?? "Back"}</span>
      </button>
      <span
        className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold"
        aria-hidden="true"
      >
        <Footprints className="size-4" />
      </span>
      <button
        type="button"
        className={buttonClass}
        disabled={!forward}
        onClick={() => forward && onNavigate(forward.id)}
        aria-label={forward ? `اتحرك إلى ${forward.name}` : "لا يوجد مشهد أمامي"}
        title={forward?.name}
      >
        <span className="hidden sm:inline">{forward?.name ?? "Forward"}</span>
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

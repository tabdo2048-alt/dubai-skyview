import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Compass,
  Moon,
  Pause,
  Play,
  SkipForward,
  Square,
  Sun,
} from "lucide-react";
import type { TourSceneRow } from "./types";
import type { TourTimeOfDay } from "./sceneExperience";

interface TourExperienceControlsProps {
  getHeading: () => number;
  sceneIndex: number;
  sceneCount: number;
  previousScene: TourSceneRow | null;
  nextScene: TourSceneRow | null;
  previousLabel: string | null;
  nextLabel: string | null;
  guided: boolean;
  guidedPaused: boolean;
  timeOfDay: TourTimeOfDay | null;
  timePair: TourSceneRow | null;
  onNavigate: (sceneId: string) => void;
  onToggleGuided: () => void;
  onToggleGuidedPause: () => void;
  onStopGuided: () => void;
  onDayNight: () => void;
}

const buttonClass =
  "grid size-11 shrink-0 place-items-center rounded-xl text-cream transition hover:bg-white/10 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-30";

export function TourExperienceControls({
  getHeading,
  sceneIndex,
  sceneCount,
  previousScene,
  nextScene,
  previousLabel,
  nextLabel,
  guided,
  guidedPaused,
  timeOfDay,
  timePair,
  onNavigate,
  onToggleGuided,
  onToggleGuidedPause,
  onStopGuided,
  onDayNight,
}: TourExperienceControlsProps) {
  const [heading, setHeading] = useState(getHeading);

  useEffect(() => {
    const update = () =>
      setHeading((current) => {
        const next = getHeading();
        return Math.abs(current - next) >= 1 ? next : current;
      });
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [getHeading]);

  return (
    <div
      className="absolute right-3 top-20 z-40 flex flex-col gap-2 lg:right-5"
      aria-label="Tour experience controls"
    >
      <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-black/65 p-1 shadow-xl backdrop-blur-xl">
        <div
          className="relative grid size-11 place-items-center text-gold"
          aria-label={`اتجاه العرض ${Math.round(heading)} درجة`}
        >
          <Compass className="size-5" aria-hidden="true" />
          <span
            className="pointer-events-none absolute inset-0 grid place-items-start pt-1 text-[8px] font-bold text-cream"
            style={{ transform: `rotate(${-heading}deg)` }}
            aria-hidden="true"
          >
            N
          </span>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={!previousScene}
          onClick={() => previousScene && onNavigate(previousScene.id)}
          aria-label={previousLabel ? `انزل إلى ${previousLabel}` : "لا يوجد مستوى سابق"}
          title={previousLabel ?? undefined}
        >
          <ArrowDown className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!nextScene}
          onClick={() => nextScene && onNavigate(nextScene.id)}
          aria-label={nextLabel ? `اصعد إلى ${nextLabel}` : "لا يوجد مستوى تالٍ"}
          title={nextLabel ?? undefined}
        >
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-black/65 p-1 shadow-xl backdrop-blur-xl">
        <button
          type="button"
          className={buttonClass}
          onClick={guided ? onToggleGuidedPause : onToggleGuided}
          aria-label={
            guided
              ? guidedPaused
                ? "استئناف الجولة الإرشادية"
                : "إيقاف الجولة الإرشادية مؤقتًا"
              : "ابدأ الجولة الإرشادية"
          }
          title="Guided tour"
        >
          {guided && !guidedPaused ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        {guided ? (
          <>
            <button
              type="button"
              className={buttonClass}
              disabled={!nextScene}
              onClick={() => nextScene && onNavigate(nextScene.id)}
              aria-label="المشهد التالي في الجولة"
            >
              <SkipForward className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={onStopGuided}
              aria-label="إنهاء الجولة الإرشادية"
            >
              <Square className="size-4" aria-hidden="true" />
            </button>
          </>
        ) : null}
        {timePair && (
          <button
            type="button"
            className={buttonClass}
            onClick={onDayNight}
            aria-label={timeOfDay === "night" ? "عرض المشهد نهارًا" : "عرض المشهد ليلًا"}
            title={timeOfDay === "night" ? "Day view" : "Night view"}
          >
            {timeOfDay === "night" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        )}
      </div>

      {guided && sceneIndex >= 0 && (
        <div className="rounded-full border border-white/10 bg-black/65 px-2 py-1 text-center text-[10px] text-cream/75 backdrop-blur-xl">
          {sceneIndex + 1}/{sceneCount}
        </div>
      )}
    </div>
  );
}

interface TourLoadingProps {
  projectName: string;
  sceneName?: string;
}
export function TourLoading({ projectName, sceneName }: TourLoadingProps) {
  return (
    <div
      className="absolute inset-0 z-20 grid animate-in place-items-center bg-[radial-gradient(circle_at_center,rgba(35,29,16,0.72),rgba(8,10,13,0.94))] duration-300 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
        <div className="mt-5 font-display text-2xl text-cream">{projectName}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Loading 360° Tour{sceneName ? ` · ${sceneName}` : ""}…
        </div>
        <div className="mx-auto mt-4 h-px w-28 overflow-hidden bg-white/10">
          <div className="h-full w-1/2 animate-pulse bg-gold" />
        </div>
      </div>
    </div>
  );
}

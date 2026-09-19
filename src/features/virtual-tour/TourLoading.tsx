interface TourLoadingProps {
  projectName: string;
  sceneName?: string;
}
export function TourLoading({ projectName, sceneName }: TourLoadingProps) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#080a0d]/80 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
        <div className="mt-5 font-display text-2xl text-cream">{projectName}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Loading 360° Tour{sceneName ? ` · ${sceneName}` : ""}…
        </div>
      </div>
    </div>
  );
}

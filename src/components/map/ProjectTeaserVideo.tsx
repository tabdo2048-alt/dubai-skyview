import { useEffect, useRef, useState } from "react";
import { FastForward, Volume2, VolumeX } from "lucide-react";

const MAX_TEASER_SECONDS = 10;

export function ProjectTeaserVideo({
  src,
  poster,
  projectName,
  onDone,
}: {
  src: string;
  poster?: string | null;
  projectName: string;
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {
      // Muted autoplay can still be disabled by device policy. The native play
      // control remains available in that case.
    });
  }, [src]);

  const updateProgress = () => {
    const video = videoRef.current;
    if (!video) return;
    const limit = Math.min(
      Number.isFinite(video.duration) ? video.duration : MAX_TEASER_SECONDS,
      MAX_TEASER_SECONDS,
    );
    const elapsed = Math.min(video.currentTime, limit);
    setProgress(limit > 0 ? (elapsed / limit) * 100 : 0);
    if (video.currentTime >= MAX_TEASER_SECONDS) {
      video.pause();
      onDone();
    }
  };

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        autoPlay
        muted={muted}
        playsInline
        preload="metadata"
        onTimeUpdate={updateProgress}
        onEnded={onDone}
        onError={onDone}
        aria-label={`${projectName} project preview`}
        className="h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/20" />
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMuted((current) => !current)}
          className="glass grid h-8 w-8 place-items-center rounded-full text-cream transition-colors hover:text-gold"
          aria-label={muted ? "Unmute project video" : "Mute project video"}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/25" aria-hidden>
          <div className="h-full bg-gold transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <button
          type="button"
          onClick={onDone}
          className="glass flex h-8 items-center gap-1 rounded-full px-2.5 text-[10px] uppercase tracking-wider text-cream transition-colors hover:text-gold"
          aria-label="Skip project video"
        >
          Skip <FastForward className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

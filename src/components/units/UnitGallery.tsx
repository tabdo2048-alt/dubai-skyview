import { useMemo, useState } from "react";
import { Expand } from "lucide-react";
import type { DisplayUnitType } from "@/lib/unit-types";
import { mediaSrc } from "@/lib/media";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function SafeImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div role="img" aria-label={alt} className="grid min-h-40 place-items-center bg-muted p-6 text-muted-foreground">Image unavailable</div>
    : <img src={src} alt={alt} className={className} onError={() => setFailed(true)} decoding="async" />;
}

export function UnitGallery({ unit, projectName }: { unit: DisplayUnitType; projectName: string }) {
  const images = useMemo(() => {
    const rows = [...(unit.images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(image => ({ id: image.id, src: mediaSrc(image.src, image.url), floor: image.is_floor_plan })).filter(image => image.src);
    const floor = mediaSrc(unit.floor_plan_src, unit.floor_plan_url);
    if (floor && !rows.some(image => image.floor)) rows.push({ id: "floor", src: floor, floor: true });
    return [...rows.filter(image => !image.floor), ...rows.filter(image => image.floor)];
  }, [unit]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const active = images.find(image => image.id === selected) ?? images[0];
  const floor = images.find(image => image.floor);
  const label = `${unit.label} in ${projectName}${active?.floor ? " — floor plan" : ""}`;
  return <div className="space-y-3">
    {active ? <button type="button" className="relative w-full overflow-hidden rounded-3xl border border-gold/20 bg-white" onClick={() => setExpanded(true)} aria-label="Enlarge unit image">
      <SafeImage key={active.src} src={active.src} alt={label} className={`h-[360px] w-full sm:h-[480px] ${active.floor ? "object-contain" : "object-cover"}`} />
      <span className="absolute bottom-3 right-3 rounded-full bg-black/70 p-2 text-white"><Expand className="h-5 w-5" /></span>
    </button> : <div className="grid h-80 place-items-center rounded-3xl bg-muted text-muted-foreground">No unit photos available</div>}
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{images.map((image, index) => <button key={image.id} type="button" onClick={() => setSelected(image.id)} aria-pressed={active?.id === image.id} aria-label={image.floor ? "Show floor plan" : `Show unit photo ${index + 1}`} className={`overflow-hidden rounded-xl border ${active?.id === image.id ? "border-gold ring-1 ring-gold" : "border-border"}`}>
      <SafeImage key={image.src} src={image.src} alt={image.floor ? "Floor plan" : `Unit photo ${index + 1}`} className="h-24 w-full bg-white object-contain" />
      <span className="block p-1 text-xs">{image.floor ? "Floor plan" : `Photo ${index + 1}`}</span>
    </button>)}</div>
    {floor ? <button type="button" onClick={() => { setSelected(floor.id); setExpanded(true); }} className="w-full overflow-hidden rounded-2xl border border-gold/20 bg-white text-ink">
      <span className="block p-3 text-left text-sm font-semibold">Floor plan · Click to enlarge</span>
      <SafeImage key={floor.src} src={floor.src} alt={`${unit.label} floor plan`} className="h-72 w-full object-contain p-2" />
    </button> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Floor plan not provided yet.</p>}
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="max-w-6xl">
      <DialogTitle>{unit.label}</DialogTitle><DialogDescription>{active?.floor ? "Floor plan" : "Unit photo"} — {projectName}</DialogDescription>
      {active && <SafeImage key={active.src} src={active.src} alt={label} className="max-h-[75vh] w-full bg-white object-contain" />}
    </DialogContent></Dialog>
  </div>;
}

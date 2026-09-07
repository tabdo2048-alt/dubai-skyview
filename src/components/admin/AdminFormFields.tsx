import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { parseLatLngFromGoogleMapsUrl } from "@/lib/googleMapsLink";

export function AdminField({ label, children }: { label: string; children: ReactNode }) {
  return <div><Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;
}

export function LocationFromLink({ onCoords }: { onCoords: (coords: { lat: number; lng: number }) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply() {
    let coords = parseLatLngFromGoogleMapsUrl(url);
    if (!coords && /goo\.gl|maps\.app\.goo\.gl/i.test(url)) {
      setBusy(true);
      try {
        const { data, error } = await supabase.functions.invoke("resolve-maps-link", { body: { url: url.trim() } });
        if (!error && data && typeof data.lat === "number" && typeof data.lng === "number") coords = { lat: data.lat, lng: data.lng };
      } finally {
        setBusy(false);
      }
    }
    if (!coords) return toast.error("Couldn't read coordinates from that link. Paste a full Google Maps URL containing @lat,lng.");
    onCoords(coords);
    toast.success(`Location set to ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
    setUrl("");
  }
  return <div className="flex gap-2"><Input value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void apply(); } }} placeholder="Paste Google Maps link" /><Button type="button" onClick={() => void apply()} disabled={!url.trim() || busy} className="shrink-0">{busy ? "…" : "Set"}</Button></div>;
}

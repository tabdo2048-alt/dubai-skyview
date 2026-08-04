// Supabase Edge Function: resolve a Google Maps link to { lat, lng }.
//
// The admin "Google Maps link" field parses full URLs client-side, but SHORT
// links (maps.app.goo.gl / goo.gl/maps) only reveal their coordinates after
// following a redirect — which the browser can't read cross-origin. This runs
// server-side (no CORS limit), follows the redirect, and extracts lat/lng.
//
// Deploy:  supabase functions deploy resolve-maps-link
// Call:    supabase.functions.invoke("resolve-maps-link", { body: { url } })

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseLatLng(url: string): { lat: number; lng: number } | null {
  const inRange = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const tries: RegExp[] = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|sll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i,
  ];
  for (const re of tries) {
    const m = url.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (inRange(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url.trim()) return json({ error: "url required" }, 400);

    let coords = parseLatLng(url);
    if (!coords) {
      // Follow the redirect chain to the full maps URL, then parse it (and the body).
      const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
      coords = parseLatLng(res.url);
      if (!coords) coords = parseLatLng(await res.text());
    }
    if (!coords) return json({ error: "no coordinates found in link" }, 422);
    return json(coords, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

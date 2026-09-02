// Extract [lat, lng] from a pasted Google Maps URL so the admin can set a
// location by link instead of typing coordinates. Handles the common full-URL
// shapes; short `maps.app.goo.gl` / `goo.gl/maps` links are NOT resolvable
// client-side (they need a server redirect), so those return null.
//
// Supported:
//   …/@25.1972,55.2744,17z…                    (the /@lat,lng form)
//   ?q=25.1972,55.2744 / ?query= / ?ll= / &destination=…  (incl. url-encoded comma)
//   …!3d25.1972!4d55.2744…                      (place data segment)
export function parseLatLngFromGoogleMapsUrl(
  input: string,
): { lat: number; lng: number } | null {
  const url = input.trim();
  if (!url) return null;

  const inRange = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const tries: RegExp[] = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, // /@lat,lng
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // !3dlat!4dlng
    /[?&](?:q|query|ll|sll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i, // ?q=lat,lng
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

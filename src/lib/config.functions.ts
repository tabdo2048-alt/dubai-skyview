import { createServerFn } from "@tanstack/react-start";

// Returns publishable map keys to the browser. These keys are meant to be
// referrer-restricted at the Google/Mapbox console.
export const getMapConfig = createServerFn({ method: "GET" }).handler(async () => {
  return {
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
    mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN ?? "",
  };
});

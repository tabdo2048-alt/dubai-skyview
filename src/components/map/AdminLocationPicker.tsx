import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { DUBAI_BOUNDS } from "@/lib/dubai";

type Props = {
  accessToken: string;
  lat: number;
  lng: number;
  /** Called whenever the user clicks the map or drags the marker. */
  onChange: (coords: { lat: number; lng: number }) => void;
};

/**
 * A small satellite map for the admin form: click anywhere (or drag the pin) to
 * set a project's location. Emits lat/lng back so the numeric fields stay in
 * sync. Locked to the Dubai bounds so admins can't place projects elsewhere.
 */
export function AdminLocationPicker({ accessToken, lat, lng, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  // Keep the latest onChange in a ref so the map's click handler (bound once)
  // always calls the current callback without re-initialising the map.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || !accessToken) return;
    mapboxgl.accessToken = accessToken;
    containerRef.current.style.backgroundColor = "#d9eef2";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [lng, lat],
      zoom: 13,
      maxBounds: [
        [DUBAI_BOUNDS.west, DUBAI_BOUNDS.south],
        [DUBAI_BOUNDS.east, DUBAI_BOUNDS.north],
      ],
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    // Draggable gold pin at the current position.
    const marker = new mapboxgl.Marker({ color: "#c9a84c", draggable: true })
      .setLngLat([lng, lat])
      .addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      onChangeRef.current({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });
    });

    // Click anywhere to move the pin there.
    map.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      onChangeRef.current({ lat: +e.lngLat.lat.toFixed(6), lng: +e.lngLat.lng.toFixed(6) });
    });

    // Fix sizing once the container is laid out (avoids a partial/black canvas).
    map.on("load", () => setTimeout(() => map.resize(), 50));

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Sync the marker + view when lat/lng change from the numeric inputs.
  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;
    const cur = marker.getLngLat();
    // Only move if meaningfully different, so typing in the fields doesn't fight
    // the marker (and vice-versa via the rounding above).
    if (Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lng) > 1e-6) {
      marker.setLngLat([lng, lat]);
      map.easeTo({ center: [lng, lat], duration: 400 });
    }
  }, [lat, lng]);

  return (
    <div className="overflow-hidden rounded-xl border border-gold/20">
      <div ref={containerRef} className="h-56 w-full" />
      <p className="bg-black/40 px-3 py-1.5 text-[11px] text-cream/70">
        Click the map or drag the pin to set the project location.
      </p>
    </div>
  );
}

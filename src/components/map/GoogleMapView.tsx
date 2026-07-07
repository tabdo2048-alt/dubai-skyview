import { useEffect, useMemo, useRef } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import Supercluster from "supercluster";
import { DUBAI_BOUNDS, DUBAI_CENTER, DEFAULT_ZOOM } from "@/lib/dubai";
import type { ProjectWithRelations } from "@/lib/types";
import { useFiltersStore } from "@/store/filters";

type Props = {
  apiKey: string;
  projects: ProjectWithRelations[];
  camera: { lat: number; lng: number; zoom: number };
  onCameraChange: (c: { lat: number; lng: number; zoom: number }) => void;
};

export function GoogleMapView({ apiKey, projects, camera, onCameraChange }: Props) {
  if (!apiKey) return <MissingKey label="Google Maps API key" />;
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        mapId="dubai-satellite"
        defaultCenter={{ lat: camera.lat, lng: camera.lng }}
        defaultZoom={camera.zoom}
        mapTypeId="satellite"
        tilt={0}
        disableDefaultUI
        gestureHandling="greedy"
        restriction={{
          latLngBounds: { north: DUBAI_BOUNDS.north, south: DUBAI_BOUNDS.south, east: DUBAI_BOUNDS.east, west: DUBAI_BOUNDS.west },
          strictBounds: false,
        }}
        minZoom={10}
        maxZoom={20}
        className="h-full w-full"
        onCameraChanged={(e) => onCameraChange({ lat: e.detail.center.lat, lng: e.detail.center.lng, zoom: e.detail.zoom })}
      >
        <ClusteredMarkers projects={projects} />
      </Map>
    </APIProvider>
  );
}

function ClusteredMarkers({ projects }: { projects: ProjectWithRelations[] }) {
  const map = useMap();
  const { selectedProjectId, setSelectedProjectId } = useFiltersStore();
  const clusterRef = useRef<Supercluster | null>(null);

  const points = useMemo(
    () =>
      projects.map((p) => ({
        type: "Feature" as const,
        properties: { cluster: false, projectId: p.id, featured: p.featured },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    [projects],
  );

  useEffect(() => {
    const idx = new Supercluster({ radius: 60, maxZoom: 16 });
    idx.load(points as never);
    clusterRef.current = idx;
  }, [points]);

  // trigger re-render on map idle via zoom subscription
  const zoom = map?.getZoom() ?? DEFAULT_ZOOM;
  const bounds = map?.getBounds();
  const bbox: [number, number, number, number] = bounds
    ? [bounds.getSouthWest().lng(), bounds.getSouthWest().lat(), bounds.getNorthEast().lng(), bounds.getNorthEast().lat()]
    : [DUBAI_BOUNDS.west, DUBAI_BOUNDS.south, DUBAI_BOUNDS.east, DUBAI_BOUNDS.north];

  const clusters = clusterRef.current?.getClusters(bbox, Math.round(zoom)) ?? [];

  return (
    <>
      {clusters.map((c) => {
        const [lng, lat] = c.geometry.coordinates as [number, number];
        const props = c.properties as { cluster?: boolean; point_count?: number; projectId?: string; featured?: boolean };
        if (props.cluster) {
          return (
            <AdvancedMarker
              key={`cluster-${c.id}`}
              position={{ lat, lng }}
              onClick={() => {
                if (!map || !clusterRef.current) return;
                const expZoom = clusterRef.current.getClusterExpansionZoom(Number(c.id));
                map.panTo({ lat, lng });
                map.setZoom(Math.min(expZoom, 18));
              }}
            >
              <div className="grid h-11 w-11 place-items-center rounded-full border border-gold/50 bg-emerald-deep/80 font-display text-sm text-gold shadow-lg backdrop-blur">
                {props.point_count}
              </div>
            </AdvancedMarker>
          );
        }
        const selected = props.projectId === selectedProjectId;
        return (
          <AdvancedMarker
            key={props.projectId}
            position={{ lat, lng }}
            onClick={() => setSelectedProjectId(props.projectId ?? null)}
          >
            <div className="group relative -translate-y-1/2">
              <div
                className={`grid h-8 w-8 place-items-center rounded-full border-2 transition-all ${
                  selected
                    ? "scale-125 border-gold bg-gold shadow-[0_0_24px_theme(colors.amber.400)]"
                    : "border-gold/70 bg-emerald-deep hover:scale-110"
                }`}
              >
                <div className={`h-2 w-2 rounded-full ${selected ? "bg-emerald-deep" : "bg-gold"}`} />
              </div>
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}

function MissingKey({ label }: { label: string }) {
  return (
    <div className="grid h-full w-full place-items-center bg-background">
      <div className="glass gold-hairline max-w-md rounded-2xl p-6 text-center">
        <div className="font-display text-xl text-cream">{label} required</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Add your key to enable the map. Restrict it to your Lovable preview and published domains.
        </p>
      </div>
    </div>
  );
}

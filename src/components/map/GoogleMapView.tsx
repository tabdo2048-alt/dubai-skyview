import { useEffect, useMemo, useRef } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { TrainFront as TrainIcon } from "lucide-react";
import Supercluster from "supercluster";
import { DUBAI_BOUNDS, DUBAI_CENTER, DEFAULT_ZOOM } from "@/lib/dubai";
import type { ProjectWithRelations } from "@/lib/types";
import { useFiltersStore } from "@/store/filters";
import { METRO_LINES, TRAIN_LINES } from "@/lib/metro";

type Props = {
  apiKey: string;
  projects: ProjectWithRelations[];
  camera: { lat: number; lng: number; zoom: number };
  onCameraChange: (c: { lat: number; lng: number; zoom: number }) => void;
  metroMode?: boolean;
  trainMode?: boolean;
};

export function GoogleMapView({ apiKey, projects, camera, onCameraChange, metroMode = false, trainMode = false }: Props) {
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
        {(metroMode || trainMode) && <MetroTrainPolylines metroMode={metroMode} trainMode={trainMode} />}
      </Map>
    </APIProvider>
  );
}

function MetroTrainPolylines({ metroMode, trainMode }: { metroMode: boolean; trainMode: boolean }) {
  const map = useMap();
  const polylinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!map) return;

    // Clear existing polylines
    polylinesRef.current.forEach((p: any) => p.setMap?.(null));
    polylinesRef.current = [];

    const drawMetro = () => {
      METRO_LINES.forEach((line) => {
        // Glow line (thick, semi-transparent)
        const glowPolyline = new (window as any).google.maps.Polyline({
          path: line.path.map(([lng, lat]) => ({ lat, lng })),
          geodesic: true,
          strokeColor: line.color,
          strokeOpacity: 0.3,
          strokeWeight: 8,
          map,
        });
        polylinesRef.current.push(glowPolyline);

        // Main line (crisp, solid)
        const mainPolyline = new (window as any).google.maps.Polyline({
          path: line.path.map(([lng, lat]) => ({ lat, lng })),
          geodesic: true,
          strokeColor: line.color,
          strokeOpacity: 0.85,
          strokeWeight: 3,
          map,
        });
        polylinesRef.current.push(mainPolyline);

        // Station markers
        line.stations.forEach((station) => {
          const marker = new (window as any).google.maps.Marker({
            position: { lat: station.coord[1], lng: station.coord[0] },
            map,
            title: station.name,
            icon: {
              path: (window as any).google.maps.SymbolPath.CIRCLE,
              scale: station.interchange ? 8 : 5,
              fillColor: line.color,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 1.5,
            },
          });
          polylinesRef.current.push(marker);
        });
      });
    };

    const drawTrain = () => {
      TRAIN_LINES.forEach((line) => {
        // Glow line
        const glowPolyline = new (window as any).google.maps.Polyline({
          path: line.path.map(([lng, lat]) => ({ lat, lng })),
          geodesic: true,
          strokeColor: line.color,
          strokeOpacity: 0.25,
          strokeWeight: 6,
          map,
        });
        polylinesRef.current.push(glowPolyline);

        // Main line (dashed for trains)
        const mainPolyline = new (window as any).google.maps.Polyline({
          path: line.path.map(([lng, lat]) => ({ lat, lng })),
          geodesic: true,
          strokeColor: line.color,
          strokeOpacity: 0.8,
          strokeWeight: 2.5,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
              offset: "0",
              repeat: "10px",
            },
          ],
          map,
        });
        polylinesRef.current.push(mainPolyline);

        // Station markers
        line.stations.forEach((station) => {
          const marker = new (window as any).google.maps.Marker({
            position: { lat: station.coord[1], lng: station.coord[0] },
            map,
            title: station.name,
            icon: {
              path: (window as any).google.maps.SymbolPath.CIRCLE,
              scale: 5,
              fillColor: line.color,
              fillOpacity: 0.7,
              strokeColor: "#fff",
              strokeWeight: 1,
            },
          });
          polylinesRef.current.push(marker);
        });
      });
    };

    if (metroMode) drawMetro();
    if (trainMode) drawTrain();

    return () => {
      polylinesRef.current.forEach((p: any) => p.setMap?.(null));
      polylinesRef.current = [];
    };
  }, [map, metroMode, trainMode]);

  return null;
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
                className={`grid h-9 w-9 place-items-center rounded-full border-2 transition-all ${
                  selected
                    ? "scale-125 border-gold bg-gold shadow-[0_0_24px_theme(colors.amber.400)]"
                    : "border-gold/70 bg-emerald-deep hover:scale-110"
                }`}
              >
                <TrainIcon className={`h-5 w-5 ${selected ? "text-emerald-deep" : "text-gold"}`} />
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

import { useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  Cartographic,
  Cesium3DTileset,
  HeadingPitchRoll,
  Math as CesiumMath,
  Matrix4,
  Model,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  type Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CesiumPhotorealisticCity } from "./CesiumPhotorealisticCity";
import { CesiumRuntimeGeodata } from "./CesiumRuntimeGeodata";
import { readPhotorealisticConfig } from "./photorealisticConfig";
import { detectProjectModelType, tilesetPlacementBasis } from "./projectModelTransforms";
import "./credits.css";
import { createCesiumScene } from "./CesiumSceneController";

export type ProjectPlacement = {
  latitude: number;
  longitude: number;
  altitude: number;
  scale: number;
  heading: number;
};

type Props = {
  modelUrl: string;
  plotGeometry?: unknown;
  ionToken?: string;
  value: ProjectPlacement;
  onSave: (placement: ProjectPlacement) => void;
  onCancel: () => void;
};

type PreviewResource = Model | Cesium3DTileset;

function placementMatrix(value: ProjectPlacement) {
  const base = Transforms.headingPitchRollToFixedFrame(
    Cartesian3.fromDegrees(value.longitude, value.latitude, value.altitude),
    new HeadingPitchRoll(CesiumMath.toRadians(value.heading), 0, 0),
  );
  return Matrix4.multiplyByUniformScale(base, value.scale, new Matrix4());
}

export function CesiumProjectPlacementEditor({
  modelUrl,
  ionToken,
  plotGeometry,
  value,
  onSave,
  onCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const basisRef = useRef(Matrix4.clone(Matrix4.IDENTITY));
  const draftRef = useRef(value);
  const viewerRef = useRef<Viewer | null>(null);
  const resourceRef = useRef<PreviewResource | null>(null);
  const initialRef = useRef({ ...value });
  const initial = initialRef.current;
  const [draft, setDraft] = useState<ProjectPlacement>(initial);
  draftRef.current = draft;
  const [message, setMessage] = useState("Click the map to move the project anchor.");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let viewer: Viewer;
    try {
      viewer = createCesiumScene(container, ionToken, creditRef.current ?? undefined);
    } catch {
      setMessage("3D graphics are unavailable. Placement values can still be edited below.");
      return;
    }
    viewerRef.current = viewer;
    const startingPlacement = initialRef.current;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        startingPlacement.longitude,
        startingPlacement.latitude,
        1_800,
      ),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-50), roll: 0 },
      duration: 0,
    });
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: import("cesium").Cartesian2 }) => {
      const world = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (!world) return;
      const cartographic = Cartographic.fromCartesian(world);
      setDraft((current) => ({
        ...current,
        longitude: CesiumMath.toDegrees(cartographic.longitude),
        latitude: CesiumMath.toDegrees(cartographic.latitude),
      }));
      setMessage("Anchor moved. Fine-tune heading, scale and altitude, then save placement.");
    }, ScreenSpaceEventType.LEFT_CLICK);

    let cancelled = false;
    let modelReady = false;
    const cleanup: Array<() => void> = [];
    let fallback: CesiumRuntimeGeodata | null = null;
    const city = new CesiumPhotorealisticCity(
      viewer,
      readPhotorealisticConfig(import.meta.env, ionToken),
      (state, status) => {
        if (cancelled) return;
        if (state === "masterplan" && !fallback) {
          fallback = new CesiumRuntimeGeodata(viewer, () => []);
          void fallback.start();
        }
        if (status) setMessage(status);
        syncVisibility();
      },
    );
    function syncVisibility() {
      const resource = resourceRef.current;
      if (!resource || !modelReady || cancelled) return;
      resource.show = city.activate({
        id: "placement-preview",
        plot_geometry: plotGeometry ?? null,
      });
      viewer.scene.requestRender();
    }
    void city.start();
    void (async () => {
      try {
        const resource =
          detectProjectModelType(modelUrl) === "3d-tiles"
            ? await Cesium3DTileset.fromUrl(modelUrl, {
                maximumScreenSpaceError: 16,
                cacheBytes: 64 * 1024 * 1024,
                maximumCacheOverflowBytes: 16 * 1024 * 1024,
                show: false,
                preloadWhenHidden: true,
              })
            : await Model.fromGltfAsync({
                url: modelUrl,
                allowPicking: false,
                incrementallyLoadTextures: false,
                show: false,
              });
        if (cancelled) {
          resource.destroy();
          return;
        }
        basisRef.current =
          resource instanceof Cesium3DTileset
            ? tilesetPlacementBasis(resource)
            : Matrix4.clone(Matrix4.IDENTITY);
        resource.modelMatrix = Matrix4.multiply(
          placementMatrix(draftRef.current),
          basisRef.current,
          new Matrix4(),
        );
        resourceRef.current = viewer.scene.primitives.add(resource);
        const ready = () => {
          modelReady = true;
          queueMicrotask(syncVisibility);
        };
        const fail = () =>
          queueMicrotask(() => {
            if (cancelled) return;
            modelReady = false;
            resource.show = false;
            city.deactivate("placement-preview");
            setMessage("Model preview failed. Original city retained.");
          });
        if (resource instanceof Model) {
          cleanup.push(
            resource.readyEvent.addEventListener(ready),
            resource.errorEvent.addEventListener(fail),
          );
          if (resource.ready) ready();
        } else
          cleanup.push(
            resource.initialTilesLoaded.addEventListener(ready),
            resource.tileFailed.addEventListener(fail),
          );
        viewer.scene.requestRender();
      } catch (error) {
        console.warn("[Cesium] Project placement preview failed");
        setMessage("The model could not be previewed. Check the URL and its CORS access.");
      }
    })();

    return () => {
      cancelled = true;
      cleanup.forEach((remove) => remove());
      city.destroy();
      fallback?.destroy();
      handler.destroy();
      resourceRef.current = null;
      viewerRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, [ionToken, modelUrl, plotGeometry]);

  useEffect(() => {
    const resource = resourceRef.current;
    if (!resource) return;
    resource.modelMatrix = Matrix4.multiply(
      placementMatrix(draft),
      basisRef.current,
      new Matrix4(),
    );
    viewerRef.current?.scene.requestRender();
  }, [draft]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gold/30 bg-black/20">
      <div
        ref={containerRef}
        className="h-[360px] w-full"
        aria-label="Cesium project model placement editor"
      />
      <div
        ref={creditRef}
        className="keyora-cesium-credits bg-slate-950 px-2 py-1 text-white"
        aria-label="Map data attribution"
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="space-y-1 text-xs text-muted-foreground">
          Latitude
          <Input
            type="number"
            step="0.000001"
            value={draft.latitude}
            onChange={(event) =>
              setDraft((current) => ({ ...current, latitude: Number(event.target.value) }))
            }
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Longitude
          <Input
            type="number"
            step="0.000001"
            value={draft.longitude}
            onChange={(event) =>
              setDraft((current) => ({ ...current, longitude: Number(event.target.value) }))
            }
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Altitude (m)
          <Input
            type="number"
            step="0.1"
            value={draft.altitude}
            onChange={(event) =>
              setDraft((current) => ({ ...current, altitude: Number(event.target.value) }))
            }
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Scale
          <Input
            type="number"
            min="0.001"
            max="10000"
            step="0.01"
            value={draft.scale}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                scale: Math.max(0.001, Number(event.target.value)),
              }))
            }
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Heading (°)
          <Input
            type="number"
            min="-360"
            max="360"
            step="1"
            value={draft.heading}
            onChange={(event) =>
              setDraft((current) => ({ ...current, heading: Number(event.target.value) }))
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
        <p className="mr-auto text-xs text-muted-foreground">{message}</p>
        <Button type="button" variant="ghost" onClick={() => setDraft({ ...initial })}>
          Reset
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          className="bg-gold text-gold-foreground"
          onClick={() => onSave(draft)}
        >
          Save placement
        </Button>
      </div>
    </div>
  );
}

export default CesiumProjectPlacementEditor;

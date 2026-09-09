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

export function CesiumProjectPlacementEditor({ modelUrl, ionToken, value, onSave, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const resourceRef = useRef<PreviewResource | null>(null);
  const initialRef = useRef({ ...value });
  const initial = initialRef.current;
  const [draft, setDraft] = useState<ProjectPlacement>(initial);
  const [message, setMessage] = useState("Click the map to move the project anchor.");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewer = createCesiumScene(container, ionToken);
    viewerRef.current = viewer;
    const startingPlacement = initialRef.current;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(startingPlacement.longitude, startingPlacement.latitude, 1_800),
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
    void (async () => {
      try {
        const resource = /tileset\.json(?:\?|$)/i.test(modelUrl)
          ? await Cesium3DTileset.fromUrl(modelUrl, { maximumScreenSpaceError: 12 })
          : await Model.fromGltfAsync({ url: modelUrl, allowPicking: false, incrementallyLoadTextures: true });
        if (cancelled) {
          resource.destroy();
          return;
        }
        resource.modelMatrix = placementMatrix(startingPlacement);
        resourceRef.current = viewer.scene.primitives.add(resource);
        viewer.scene.requestRender();
      } catch (error) {
        console.error("[Cesium] Project placement preview failed", error);
        setMessage("The model could not be previewed. Check the URL and its CORS access.");
      }
    })();

    return () => {
      cancelled = true;
      handler.destroy();
      resourceRef.current = null;
      viewerRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, [ionToken, modelUrl]);

  useEffect(() => {
    const resource = resourceRef.current;
    if (!resource) return;
    resource.modelMatrix = placementMatrix(draft);
    viewerRef.current?.scene.requestRender();
  }, [draft]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gold/30 bg-black/20">
      <div ref={containerRef} className="h-[360px] w-full" aria-label="Cesium project model placement editor" />
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="space-y-1 text-xs text-muted-foreground">
          Latitude
          <Input type="number" step="0.000001" value={draft.latitude} onChange={(event) => setDraft((current) => ({ ...current, latitude: Number(event.target.value) }))} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Longitude
          <Input type="number" step="0.000001" value={draft.longitude} onChange={(event) => setDraft((current) => ({ ...current, longitude: Number(event.target.value) }))} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Altitude (m)
          <Input type="number" step="0.1" value={draft.altitude} onChange={(event) => setDraft((current) => ({ ...current, altitude: Number(event.target.value) }))} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Scale
          <Input type="number" min="0.001" max="10000" step="0.01" value={draft.scale} onChange={(event) => setDraft((current) => ({ ...current, scale: Math.max(0.001, Number(event.target.value)) }))} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Heading (°)
          <Input type="number" min="-360" max="360" step="1" value={draft.heading} onChange={(event) => setDraft((current) => ({ ...current, heading: Number(event.target.value) }))} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
        <p className="mr-auto text-xs text-muted-foreground">{message}</p>
        <Button type="button" variant="ghost" onClick={() => setDraft({ ...initial })}>Reset</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="button" className="bg-gold text-gold-foreground" onClick={() => onSave(draft)}>Save placement</Button>
      </div>
    </div>
  );
}

export default CesiumProjectPlacementEditor;

import {
  Cartesian2,
  Cartesian3,
  Cesium3DTileFeature,
  Cesium3DTileStyle,
  Cesium3DTileset,
  Color,
  DistanceDisplayCondition,
  HeadingPitchRoll,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  Math as CesiumMath,
  Matrix4,
  Model,
  PointPrimitive,
  PointPrimitiveCollection,
  Transforms,
  VerticalOrigin,
  type Viewer,
} from "cesium";
import type { ProjectWithRelations } from "@/lib/types";
import type { ProjectPick } from "./types";
import { MASTERPLAN_LAYOUT, MASTERPLAN_THEME } from "./theme";
import { detectProjectModelType, tilesetPlacementBasis } from "./projectModelTransforms";
import { PROJECT_STREAMING, modelDistanceState } from "./photorealisticConfig";
import { isConstrainedCesiumDevice } from "./CesiumSceneController";
import { CesiumTilesetManager } from "./CesiumTilesetManager";
import {
  projectAvailabilityStyleConditions,
  readProjectFeatureMetadata,
} from "./projectFeatureMetadata";

type ProjectModelResource = Model | Cesium3DTileset;
type LoadEntry = {
  signature: string;
  cancelled: boolean;
  ready: boolean;
  visible: boolean;
  started: number;
  cleanup: Array<() => void>;
};
export type InsertLifecycle = {
  activate: (project: ProjectWithRelations) => boolean;
  deactivate: (projectId: string) => void;
  onError?: (message: string) => void;
};
function modelSignature(project: ProjectWithRelations) {
  return JSON.stringify([
    project.model_3d_url,
    project.model_3d_enabled,
    project.model_3d_lat,
    project.model_3d_lng,
    project.lat,
    project.lng,
    project.model_3d_altitude,
    project.model_3d_scale,
    project.model_3d_rotation,
    project.plot_geometry,
  ]);
}

function projectPosition(project: ProjectWithRelations) {
  return {
    latitude: project.model_3d_lat ?? project.lat,
    longitude: project.model_3d_lng ?? project.lng,
    altitude: project.model_3d_altitude ?? 0,
  };
}

function modelMatrix(project: ProjectWithRelations) {
  const position = projectPosition(project);
  return Transforms.headingPitchRollToFixedFrame(
    Cartesian3.fromDegrees(position.longitude, position.latitude, position.altitude),
    new HeadingPitchRoll(CesiumMath.toRadians(project.model_3d_rotation ?? 0), 0, 0),
  );
}

export class CesiumProjectLayer {
  private readonly points: PointPrimitiveCollection;
  private readonly labels: LabelCollection;
  private readonly markerByProject = new Map<string, PointPrimitive>();
  private readonly modelByProject = new Map<string, ProjectModelResource>();
  private readonly projectById = new Map<string, ProjectWithRelations>();
  private readonly tilesetProject = new WeakMap<Cesium3DTileset, string>();
  private readonly tilesets: CesiumTilesetManager;
  private projects: ProjectWithRelations[] = [];
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private readonly entries = new Map<string, LoadEntry>();
  private readonly failedUntil = new Map<string, number>();
  private destroyed = false;
  private lastRefresh = 0;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly viewer: Viewer,
    private readonly insertion?: InsertLifecycle,
  ) {
    this.points = viewer.scene.primitives.add(new PointPrimitiveCollection());
    this.labels = viewer.scene.primitives.add(new LabelCollection());
    this.tilesets = new CesiumTilesetManager(viewer);
    viewer.camera.moveEnd.addEventListener(this.refreshModels);
    viewer.camera.changed.addEventListener(this.cameraChanged);
    this.timer = setInterval(() => {
      if (
        !this.destroyed &&
        !document.hidden &&
        [...this.entries.values()].some((entry) => !entry.ready)
      ) {
        this.refreshModels();
        viewer.scene.requestRender();
      }
    }, 250);
  }

  setProjects(projects: ProjectWithRelations[]) {
    for (const [id, entry] of this.entries) {
      const next = projects.find((project) => project.id === id);
      if (!next || modelSignature(next) !== entry.signature) this.unloadProjectModel(id);
    }
    this.failedUntil.clear();
    this.projects = projects;
    this.projectById.clear();
    this.points.removeAll();
    this.labels.removeAll();
    this.markerByProject.clear();

    for (const project of projects) {
      this.projectById.set(project.id, project);
      const position = Cartesian3.fromDegrees(project.lng, project.lat, 5);
      const point = this.points.add({
        position,
        id: { kind: "project", projectId: project.id, source: "marker" } satisfies ProjectPick,
        pixelSize: 13,
        color: Color.fromCssColorString(MASTERPLAN_THEME.goldAccent),
        outlineColor: Color.fromCssColorString("#102729"),
        outlineWidth: 3,
        distanceDisplayCondition: new DistanceDisplayCondition(
          0,
          MASTERPLAN_LAYOUT.projectFarDistanceM,
        ),
      });
      this.markerByProject.set(project.id, point);
      this.labels.add({
        position,
        text: project.name,
        font: "600 13px system-ui",
        style: LabelStyle.FILL_AND_OUTLINE,
        fillColor: Color.fromCssColorString(MASTERPLAN_THEME.labelOutline),
        outlineColor: Color.fromCssColorString(MASTERPLAN_THEME.label),
        outlineWidth: 4,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -14),
        distanceDisplayCondition: new DistanceDisplayCondition(0, 60_000),
        disableDepthTestDistance: 15_000,
      });
    }
    this.applySelection();
    this.refreshModels();
  }

  updateSelection(selectedId: string | null, hoveredId: string | null) {
    const changed = this.selectedId !== selectedId;
    this.selectedId = selectedId;
    this.hoveredId = hoveredId;
    this.applySelection();
    if (changed) this.refreshModels();
  }

  private applySelection() {
    const { selectedId, hoveredId } = this;
    for (const [projectId, point] of this.markerByProject) {
      const active = projectId === selectedId || projectId === hoveredId;
      point.pixelSize = active ? 18 : 13;
      point.color = Color.fromCssColorString(
        projectId === selectedId
          ? MASTERPLAN_THEME.selected
          : projectId === hoveredId
            ? MASTERPLAN_THEME.hovered
            : MASTERPLAN_THEME.goldAccent,
      );
    }
    for (const [projectId, resource] of this.modelByProject) {
      if (resource instanceof Model) {
        const active = projectId === selectedId || projectId === hoveredId;
        resource.silhouetteColor = Color.fromCssColorString(
          projectId === selectedId ? MASTERPLAN_THEME.selected : MASTERPLAN_THEME.hovered,
        );
        resource.silhouetteSize = active ? (projectId === selectedId ? 2.5 : 1.25) : 0;
      }
    }
    this.viewer.scene.requestRender();
  }

  private cameraChanged = () => {
    if (performance.now() - this.lastRefresh < 200) return;
    this.lastRefresh = performance.now();
    this.refreshModels();
  };

  /** Public for city state transitions; never re-enters selection or reloads on hover. */
  refreshModels = () => {
    if (this.destroyed) return;
    const candidates = this.projects
      .filter((p) => p.model_3d_enabled && p.model_3d_url)
      .map((project) => {
        const p = projectPosition(project);
        const distance = Cartesian3.distance(
          this.viewer.camera.positionWC,
          Cartesian3.fromDegrees(p.longitude, p.latitude, p.altitude),
        );
        const entry = this.entries.get(project.id);
        return {
          project,
          distance,
          state: modelDistanceState(
            distance,
            project.id === this.selectedId,
            Boolean(entry),
            Boolean(entry?.visible),
          ),
        };
      })
      .filter((candidate) => candidate.state.load)
      .sort(
        (a, b) =>
          Number(b.project.id === this.selectedId) - Number(a.project.id === this.selectedId) ||
          a.distance - b.distance,
      )
      .slice(
        0,
        isConstrainedCesiumDevice()
          ? PROJECT_STREAMING.mobileModels
          : PROJECT_STREAMING.desktopModels,
      );
    const desired = new Set(candidates.map(({ project }) => project.id));
    for (const id of this.entries.keys()) if (!desired.has(id)) this.unloadProjectModel(id);
    let pending = [...this.entries.values()].filter((entry) => !entry.ready).length;
    for (const { project, state } of candidates) {
      const entry = this.entries.get(project.id);
      if (!entry) {
        if (
          pending < PROJECT_STREAMING.concurrentLoads &&
          Date.now() >= (this.failedUntil.get(project.id) ?? 0)
        ) {
          pending++;
          void this.loadProjectModel(project);
        }
        continue;
      }
      if (!entry.ready && Date.now() - entry.started > PROJECT_STREAMING.loadTimeoutMs) {
        this.fail(project.id);
        continue;
      }
      const resource = this.modelByProject.get(project.id);
      if (!resource || !entry.ready) continue;
      if (state.show && !entry.visible) {
        // Clip first and show in the same JS turn; no rendered frame with duplicate buildings.
        if (this.insertion && !this.insertion.activate(project)) continue;
        entry.visible = true;
        resource.show = true;
      } else if (!state.show && entry.visible) {
        resource.show = false;
        entry.visible = false;
        this.insertion?.deactivate(project.id);
      }
    }
    this.applySelection();
  };

  getVisibleProjects() {
    return this.projects.filter((project) => this.entries.get(project.id)?.visible);
  }

  private fail(projectId: string) {
    this.failedUntil.set(projectId, Date.now() + PROJECT_STREAMING.retryDelayMs);
    this.unloadProjectModel(projectId);
    const message = `Project model ${projectId} could not be loaded. Original city remains visible.`;
    console.warn(`[Cesium] ${message}`);
    this.insertion?.onError?.(message);
  }

  private async loadProjectModel(project: ProjectWithRelations) {
    const url = project.model_3d_url;
    if (!url || this.destroyed) return;
    const entry: LoadEntry = {
      signature: modelSignature(project),
      cancelled: false,
      ready: false,
      visible: false,
      started: Date.now(),
      cleanup: [],
    };
    this.entries.set(project.id, entry);
    const ready = () => {
      if (entry.cancelled || this.destroyed) return;
      entry.ready = true;
      queueMicrotask(() => this.refreshModels());
      this.viewer.scene.requestRender();
    };
    const failed = () =>
      queueMicrotask(() => {
        if (!entry.cancelled && !this.destroyed) this.fail(project.id);
      });
    try {
      if (detectProjectModelType(url) === "3d-tiles") {
        const tileset = await this.tilesets.load(project.id, url);
        if (entry.cancelled || this.destroyed) return;
        const placement = Matrix4.multiplyByUniformScale(
          modelMatrix(project),
          project.model_3d_scale ?? 1,
          new Matrix4(),
        );
        tileset.modelMatrix = Matrix4.multiply(
          placement,
          tilesetPlacementBasis(tileset),
          new Matrix4(),
        );
        tileset.style = new Cesium3DTileStyle({
          color: { conditions: projectAvailabilityStyleConditions(project.unit_types) },
        });
        this.tilesetProject.set(tileset, project.id);
        this.modelByProject.set(project.id, tileset);
        entry.cleanup.push(
          tileset.initialTilesLoaded.addEventListener(ready),
          tileset.tileFailed.addEventListener(failed),
        );
      } else {
        const model = await Model.fromGltfAsync({
          url,
          modelMatrix: modelMatrix(project),
          scale: project.model_3d_scale ?? 1,
          id: { kind: "project", projectId: project.id, source: "glb" } satisfies ProjectPick,
          allowPicking: true,
          incrementallyLoadTextures: false,
          show: false,
        });
        if (entry.cancelled || this.destroyed) {
          model.destroy();
          return;
        }
        this.modelByProject.set(project.id, this.viewer.scene.primitives.add(model));
        entry.cleanup.push(
          model.readyEvent.addEventListener(ready),
          model.errorEvent.addEventListener(failed),
        );
        if (model.ready) ready();
      }
      this.viewer.scene.requestRender();
    } catch {
      if (!entry.cancelled && !this.destroyed) this.fail(project.id);
    }
  }

  resolvePick(picked: unknown): ProjectPick | null {
    if (!picked || typeof picked !== "object") return null;
    const candidate = picked as { id?: unknown; primitive?: unknown };
    if (candidate.id && typeof candidate.id === "object") {
      const id = candidate.id as Partial<ProjectPick>;
      if (
        (id.kind === "project" || id.kind === "project-feature") &&
        typeof id.projectId === "string"
      ) {
        return id as ProjectPick;
      }
    }
    if (picked instanceof Cesium3DTileFeature) {
      const tileset = picked.tileset;
      const projectId = this.tilesetProject.get(tileset);
      if (!projectId) return null;
      const metadata = readProjectFeatureMetadata(picked);
      const projectUnit = metadata.unitTypeId
        ? this.projectById
            .get(projectId)
            ?.unit_types.find((unit) => unit.id === metadata.unitTypeId)
        : null;
      const projectAvailability =
        projectUnit?.availability === "available" ||
        projectUnit?.availability === "reserved" ||
        projectUnit?.availability === "sold"
          ? projectUnit.availability
          : undefined;
      const name = metadata.featureName ?? metadata.floorLabel;
      return {
        kind: name || metadata.unitTypeId || metadata.availability ? "project-feature" : "project",
        projectId,
        featureKey: name,
        featureName: name,
        source: "3d-tiles",
        featureType: metadata.featureType,
        floorLabel: metadata.floorLabel,
        unitTypeId: metadata.unitTypeId,
        availability: projectAvailability ?? metadata.availability,
      };
    }
    if (candidate.primitive instanceof Cesium3DTileset) {
      const projectId = this.tilesetProject.get(candidate.primitive);
      return projectId ? { kind: "project", projectId, source: "3d-tiles" } : null;
    }
    return null;
  }

  private unloadProjectModel(projectId: string) {
    const entry = this.entries.get(projectId);
    if (entry) {
      entry.cancelled = true;
      entry.cleanup.forEach((remove) => remove());
    }
    const resource = this.modelByProject.get(projectId);
    if (resource) resource.show = false;
    this.insertion?.deactivate(projectId);
    this.tilesets.unload(projectId);
    if (resource instanceof Model && !this.viewer.isDestroyed())
      this.viewer.scene.primitives.remove(resource);
    this.modelByProject.delete(projectId);
    this.entries.delete(projectId);
  }

  destroy() {
    this.destroyed = true;
    clearInterval(this.timer);
    this.viewer.camera.moveEnd.removeEventListener(this.refreshModels);
    this.viewer.camera.changed.removeEventListener(this.cameraChanged);
    for (const projectId of [...this.entries.keys()]) this.unloadProjectModel(projectId);
    this.tilesets.destroy();
    this.viewer.scene.primitives.remove(this.points);
    this.viewer.scene.primitives.remove(this.labels);
  }
}

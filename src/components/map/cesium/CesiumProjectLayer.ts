import {
  Cartesian2,
  Cartesian3,
  Cesium3DTileFeature,
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
import { CesiumTilesetManager } from "./CesiumTilesetManager";

type ProjectModelResource = Model | Cesium3DTileset;

function detectModelType(url: string) {
  return /(?:tileset\.json|\.3dtiles(?:\?|$))/i.test(url) ? "3d-tiles" : "glb";
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

function featureName(feature: Cesium3DTileFeature) {
  const preferred = ["feature_name", "name", "Name", "tower", "building", "id"];
  for (const key of preferred) {
    if (feature.hasProperty(key)) {
      const value = feature.getProperty(key);
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
  }
  return undefined;
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
  private generation = 0;

  constructor(private readonly viewer: Viewer) {
    this.points = viewer.scene.primitives.add(new PointPrimitiveCollection());
    this.labels = viewer.scene.primitives.add(new LabelCollection());
    this.tilesets = new CesiumTilesetManager(viewer);
    viewer.camera.moveEnd.addEventListener(this.refreshModels);
  }

  setProjects(projects: ProjectWithRelations[]) {
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
        distanceDisplayCondition: new DistanceDisplayCondition(0, MASTERPLAN_LAYOUT.projectFarDistanceM),
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
    this.updateSelection(this.selectedId, this.hoveredId);
    void this.refreshModels();
  }

  updateSelection(selectedId: string | null, hoveredId: string | null) {
    this.selectedId = selectedId;
    this.hoveredId = hoveredId;
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
    void this.refreshModels();
  }

  private refreshModels = async () => {
    const generation = ++this.generation;
    const cameraPosition = this.viewer.camera.positionWC;
    const desired = new Set<string>();
    for (const project of this.projects) {
      if (!project.model_3d_enabled || !project.model_3d_url) continue;
      const position = projectPosition(project);
      const distance = Cartesian3.distance(
        cameraPosition,
        Cartesian3.fromDegrees(position.longitude, position.latitude, position.altitude),
      );
      if (distance <= MASTERPLAN_LAYOUT.projectNearDistanceM || project.id === this.selectedId) {
        desired.add(project.id);
        if (!this.modelByProject.has(project.id)) await this.loadProjectModel(project, generation);
      }
    }
    if (generation !== this.generation) return;
    for (const projectId of [...this.modelByProject.keys()]) {
      if (!desired.has(projectId)) this.unloadProjectModel(projectId);
    }
    this.updateSelection(this.selectedId, this.hoveredId);
  };

  private async loadProjectModel(project: ProjectWithRelations, generation: number) {
    const url = project.model_3d_url;
    if (!url) return;
    try {
      if (detectModelType(url) === "3d-tiles") {
        const tileset = await this.tilesets.load(project.id, url);
        if (generation !== this.generation) return;
        tileset.modelMatrix = Matrix4.multiplyByUniformScale(
          modelMatrix(project),
          project.model_3d_scale ?? 1,
          new Matrix4(),
        );
        this.tilesetProject.set(tileset, project.id);
        this.modelByProject.set(project.id, tileset);
      } else {
        const model = await Model.fromGltfAsync({
          url,
          modelMatrix: modelMatrix(project),
          scale: project.model_3d_scale ?? 1,
          id: { kind: "project", projectId: project.id, source: "glb" } satisfies ProjectPick,
          allowPicking: true,
          incrementallyLoadTextures: true,
          distanceDisplayCondition: new DistanceDisplayCondition(0, MASTERPLAN_LAYOUT.projectFarDistanceM),
        });
        if (generation !== this.generation) {
          model.destroy();
          return;
        }
        this.viewer.scene.primitives.add(model);
        this.modelByProject.set(project.id, model);
      }
      this.viewer.scene.requestRender();
    } catch (error) {
      console.error(`[Cesium] Failed to load 3D model for project ${project.id}`, error);
    }
  }

  resolvePick(picked: unknown): ProjectPick | null {
    if (!picked || typeof picked !== "object") return null;
    const candidate = picked as { id?: unknown; primitive?: unknown };
    if (candidate.id && typeof candidate.id === "object") {
      const id = candidate.id as Partial<ProjectPick>;
      if ((id.kind === "project" || id.kind === "project-feature") && typeof id.projectId === "string") {
        return id as ProjectPick;
      }
    }
    if (picked instanceof Cesium3DTileFeature) {
      const tileset = picked.tileset;
      const projectId = this.tilesetProject.get(tileset);
      if (!projectId) return null;
      const name = featureName(picked);
      return {
        kind: name ? "project-feature" : "project",
        projectId,
        featureKey: name,
        featureName: name,
        source: "3d-tiles",
      };
    }
    if (candidate.primitive instanceof Cesium3DTileset) {
      const projectId = this.tilesetProject.get(candidate.primitive);
      return projectId ? { kind: "project", projectId, source: "3d-tiles" } : null;
    }
    return null;
  }

  private unloadProjectModel(projectId: string) {
    const resource = this.modelByProject.get(projectId);
    if (!resource) return;
    if (resource instanceof Cesium3DTileset) this.tilesets.unload(projectId);
    else this.viewer.scene.primitives.remove(resource);
    this.modelByProject.delete(projectId);
  }

  destroy() {
    this.generation += 1;
    this.viewer.camera.moveEnd.removeEventListener(this.refreshModels);
    for (const projectId of [...this.modelByProject.keys()]) this.unloadProjectModel(projectId);
    this.tilesets.destroy();
    this.viewer.scene.primitives.remove(this.points);
    this.viewer.scene.primitives.remove(this.labels);
  }
}

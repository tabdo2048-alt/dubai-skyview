import type { Json } from "@/integrations/supabase/types";
import type { TourSceneRow } from "./types";

export type TourTimeOfDay = "day" | "night";

export interface SceneExperienceMetadata {
  timeOfDay: TourTimeOfDay | null;
  pairedSceneId: string | null;
  compassNorthOffset: number;
  verticalLabel: string | null;
}

type JsonRecord = Record<string, Json | undefined>;

function jsonRecord(value: Json | null): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function sceneExperienceMetadata(
  scene: Pick<TourSceneRow, "multires_config">,
): SceneExperienceMetadata {
  const config = jsonRecord(scene.multires_config);
  const experience = jsonRecord(config.experience ?? null);
  const timeOfDay =
    experience.timeOfDay === "day" || experience.timeOfDay === "night"
      ? experience.timeOfDay
      : null;
  const pairedSceneId =
    typeof experience.pairedSceneId === "string" && experience.pairedSceneId.trim()
      ? experience.pairedSceneId.trim()
      : null;
  const compassNorthOffset =
    typeof experience.compassNorthOffset === "number" &&
    Number.isFinite(experience.compassNorthOffset)
      ? normalizeHeading(experience.compassNorthOffset)
      : 0;
  const verticalLabel =
    typeof experience.verticalLabel === "string" && experience.verticalLabel.trim()
      ? experience.verticalLabel.trim()
      : null;
  return { timeOfDay, pairedSceneId, compassNorthOffset, verticalLabel };
}

export function withSceneExperienceMetadata(
  current: Json | null,
  next: Partial<SceneExperienceMetadata>,
): Json {
  const config = jsonRecord(current);
  const experience = jsonRecord(config.experience ?? null);
  const merged: JsonRecord = { ...experience };
  if ("timeOfDay" in next) merged.timeOfDay = next.timeOfDay;
  if ("pairedSceneId" in next) merged.pairedSceneId = next.pairedSceneId;
  if ("compassNorthOffset" in next)
    merged.compassNorthOffset = normalizeHeading(next.compassNorthOffset ?? 0);
  if ("verticalLabel" in next) merged.verticalLabel = next.verticalLabel;
  return { ...config, experience: merged } as Json;
}

export function normalizeHeading(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizedPairName(name: string): string {
  return name
    .toLocaleLowerCase()
    .replace(/\b(day|daytime|night|nighttime|نهار|ليل)\b/gu, "")
    .replace(/[\s\-_–—()]+/gu, " ")
    .trim();
}

export function findTimeOfDayPair(
  scene: TourSceneRow,
  scenes: TourSceneRow[],
): TourSceneRow | null {
  const metadata = sceneExperienceMetadata(scene);
  if (metadata.pairedSceneId) {
    const explicit = scenes.find((candidate) => candidate.id === metadata.pairedSceneId);
    if (explicit && explicit.tour_id === scene.tour_id && explicit.is_published) return explicit;
  }
  if (!metadata.timeOfDay) return null;
  const expected: TourTimeOfDay = metadata.timeOfDay === "day" ? "night" : "day";
  const baseName = normalizedPairName(scene.name);
  return (
    scenes.find((candidate) => {
      const candidateMetadata = sceneExperienceMetadata(candidate);
      return (
        candidate.id !== scene.id &&
        candidate.tour_id === scene.tour_id &&
        candidate.is_published &&
        candidateMetadata.timeOfDay === expected &&
        normalizedPairName(candidate.name) === baseName
      );
    }) ?? null
  );
}

export function sceneVerticalLabel(scene: TourSceneRow, floorName?: string | null): string {
  return sceneExperienceMetadata(scene).verticalLabel ?? floorName ?? scene.name;
}

export function adjacentTourScenes(
  scenes: TourSceneRow[],
  currentSceneId: string,
): { previous: TourSceneRow | null; next: TourSceneRow | null; index: number } {
  const index = scenes.findIndex((scene) => scene.id === currentSceneId);
  if (index < 0) return { previous: null, next: null, index: -1 };
  return {
    previous: index > 0 ? scenes[index - 1] : null,
    next: index < scenes.length - 1 ? scenes[index + 1] : null,
    index,
  };
}

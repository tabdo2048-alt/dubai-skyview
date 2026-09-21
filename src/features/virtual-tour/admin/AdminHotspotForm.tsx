import { useState } from "react";
import { Crosshair, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hotspotMetadataText, hotspotNavigationDirection, hotspotUnitTypeId } from "../hotspotData";
import type { TourHotspotRow, TourHotspotType, TourSceneRow } from "../types";
import type { AdminTourUnit } from "./adminQueries";
import {
  hotspotMetadataFromDraft,
  validateHotspotDraft,
  type HotspotDraft,
} from "./adminValidation";

interface AdminHotspotFormProps {
  scene: TourSceneRow;
  scenes: TourSceneRow[];
  units: AdminTourUnit[];
  hotspot: TourHotspotRow | null;
  placement: { yaw: number; pitch: number };
  saving: boolean;
  onSave: (draft: HotspotDraft, metadata: Record<string, string>) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  onReposition?: () => void;
}

function initialDraft(
  hotspot: TourHotspotRow | null,
  placement: { yaw: number; pitch: number },
): HotspotDraft {
  return {
    type: (hotspot?.type as TourHotspotType | undefined) ?? "navigation",
    label: hotspot?.label ?? "",
    targetSceneId: hotspot?.target_scene_id ?? null,
    yaw: hotspot?.yaw ?? placement.yaw,
    pitch: hotspot?.pitch ?? placement.pitch,
    title: hotspot ? (hotspotMetadataText(hotspot.metadata, "title") ?? "") : "",
    description: hotspot ? (hotspotMetadataText(hotspot.metadata, "description") ?? "") : "",
    image: hotspot ? (hotspotMetadataText(hotspot.metadata, "image") ?? "") : "",
    url: hotspot ? (hotspotMetadataText(hotspot.metadata, "url") ?? "") : "",
    unitTypeId: hotspot ? (hotspotUnitTypeId(hotspot.metadata) ?? "") : "",
    navigationDirection: hotspot ? hotspotNavigationDirection(hotspot.metadata) : "auto",
  };
}

export function AdminHotspotForm({
  scene,
  scenes,
  units,
  hotspot,
  placement,
  saving,
  onSave,
  onCancel,
  onDelete,
  onReposition,
}: AdminHotspotFormProps) {
  const [draft, setDraft] = useState(() => initialDraft(hotspot, placement));
  const [errors, setErrors] = useState<string[]>([]);

  const submit = async () => {
    const validation = validateHotspotDraft(draft, scenes, scene.id);
    setErrors(validation);
    if (validation.length > 0) return;
    await onSave(draft, hotspotMetadataFromDraft(draft));
  };

  const set = <Key extends keyof HotspotDraft>(key: Key, value: HotspotDraft[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-3 rounded-2xl border border-gold/25 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg text-cream">
          {hotspot ? "Edit Hotspot" : "New Hotspot"}
        </h3>
        <span className="text-[11px] text-muted-foreground">
          Yaw {draft.yaw.toFixed(2)} · Pitch {draft.pitch.toFixed(2)}
        </span>
      </div>
      <label className="grid gap-1 text-xs text-cream">
        Type
        <select
          value={draft.type}
          onChange={(event) => set("type", event.target.value as TourHotspotType)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="navigation">Navigation</option>
          <option value="information">Information</option>
          <option value="amenity">Amenity</option>
          <option value="unit">Unit</option>
          <option value="external_link">External Link</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs text-cream">
        Label
        <Input
          value={draft.label}
          onChange={(event) => set("label", event.target.value)}
          maxLength={160}
        />
      </label>
      {draft.type === "navigation" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-cream">
            Target Scene
            <select
              value={draft.targetSceneId ?? ""}
              onChange={(event) => set("targetSceneId", event.target.value || null)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">اختر المشهد</option>
              {scenes
                .filter(
                  (candidate) => candidate.id !== scene.id && candidate.tour_id === scene.tour_id,
                )
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-cream">
            Walk Direction
            <select
              value={draft.navigationDirection ?? "auto"}
              onChange={(event) =>
                set(
                  "navigationDirection",
                  event.target.value as NonNullable<HotspotDraft["navigationDirection"]>,
                )
              }
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="auto">Auto</option>
              <option value="forward">Forward</option>
              <option value="backward">Backward</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </label>
        </div>
      )}
      {(draft.type === "information" || draft.type === "amenity") && (
        <>
          <label className="grid gap-1 text-xs text-cream">
            Title
            <Input
              value={draft.title ?? ""}
              onChange={(event) => set("title", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-cream">
            Description
            <Textarea
              value={draft.description ?? ""}
              onChange={(event) => set("description", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-cream">
            Image URL — optional
            <Input
              value={draft.image ?? ""}
              onChange={(event) => set("image", event.target.value)}
              placeholder="https://…"
            />
          </label>
        </>
      )}
      {draft.type === "unit" && (
        <label className="grid gap-1 text-xs text-cream">
          Unit
          <select
            value={draft.unitTypeId ?? ""}
            onChange={(event) => set("unitTypeId", event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">اختر الوحدة</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {draft.type === "external_link" && (
        <label className="grid gap-1 text-xs text-cream">
          HTTPS URL
          <Input
            value={draft.url ?? ""}
            onChange={(event) => set("url", event.target.value)}
            placeholder="https://…"
          />
        </label>
      )}
      {errors.length > 0 && (
        <div role="alert" className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={saving}
          onClick={() => void submit()}
          className="bg-gold text-gold-foreground"
        >
          {saving && <Loader2 className="mr-1 size-4 animate-spin" />} Save
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {hotspot && onReposition && (
          <Button variant="ghost" onClick={onReposition}>
            <Crosshair className="mr-1 size-4" /> Reposition
          </Button>
        )}
        {hotspot && onDelete && (
          <Button variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1 size-4" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}

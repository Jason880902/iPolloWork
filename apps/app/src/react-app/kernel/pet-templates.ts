/**
 * Pet template registry — the selectable desktop companion appearances.
 * Shared by the settings page (template picker cards) and the pet window
 * (which mounts the matching renderer). The whale-girl spritesheet contract
 * is ported from @linxin666/dsh-pet (Apache-2.0, (c) zhu1090093659).
 */

import type { PetAnimation } from "../../pet/whale-contract";

export type SpriteTrackDef = {
  durations: number[];
  loop: boolean;
};

export type SpriteSheetDef = {
  atlasUrl: string;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  /** Fixed row order of the animation contract. */
  rowOrder: PetAnimation[];
  /** Used frame count per row (same order as rowOrder). */
  rowFrames: number[];
  tracks: Record<PetAnimation, SpriteTrackDef>;
  /** Rendered sprite height in px (atlas cell height scaled). */
  displaySize: number;
};

export type PetTemplate = {
  id: string;
  kind: "spritesheet" | "live2d";
  /** Name the pet falls back to when the user has not set a nickname. */
  defaultName: string;
  /** Card tagline in the settings picker. */
  tagline: string;
  /** Card preview image (app-relative URL). */
  previewUrl: string;
  sprite?: SpriteSheetDef;
  /** Live2D model3.json URL (app-relative). */
  modelUrl?: string;
  /** Whether the template animates along with agent activity. */
  activityAnimation: boolean;
};

export const WHALE_SPRITE: SpriteSheetDef = {
  atlasUrl: "pet-models/whale/spritesheet.webp",
  cellWidth: 192,
  cellHeight: 208,
  columns: 8,
  rowOrder: [
    "idle",
    "running-right",
    "running-left",
    "waving",
    "jumping",
    "failed",
    "waiting",
    "running",
    "review",
  ],
  rowFrames: [6, 8, 8, 4, 5, 8, 6, 6, 6],
  tracks: {
    idle: { durations: [400, 400, 500, 400, 400, 500], loop: true },
    "running-right": { durations: [225, 225, 225, 225, 225, 225, 225, 225], loop: true },
    "running-left": { durations: [225, 225, 225, 225, 225, 225, 225, 225], loop: true },
    waving: { durations: [350, 350, 350, 350], loop: true },
    jumping: { durations: [300, 300, 300, 350, 350], loop: false },
    failed: { durations: [450, 450, 450, 500, 550, 600, 450, 450], loop: false },
    waiting: { durations: [450, 450, 500, 450, 450, 500], loop: true },
    running: { durations: [250, 250, 250, 250, 250, 250], loop: true },
    review: { durations: [550, 550, 550, 550, 550, 550], loop: true },
  },
  displaySize: 192,
};

export const PET_TEMPLATES: readonly PetTemplate[] = [
  {
    id: "whale-girl",
    kind: "spritesheet",
    defaultName: "鲸鱼娘",
    tagline: "来自深海的陪伴小伙伴，会随你的任务状态奔跑、跳跃、庆祝",
    previewUrl: "pet-models/whale/preview.gif",
    sprite: WHALE_SPRITE,
    activityAnimation: true,
  },
  {
    id: "hiyori",
    kind: "live2d",
    defaultName: "小珀",
    tagline: "Live2D 经典形象，会眨眼、跟随、回应你的抚摸",
    previewUrl: "pet-models/hiyori/preview.gif",
    modelUrl: "pet-models/hiyori/Hiyori.model3.json",
    activityAnimation: false,
  },
];

export const DEFAULT_PET_TEMPLATE_ID = "whale-girl";

export function petTemplateById(id: string | null | undefined): PetTemplate {
  return PET_TEMPLATES.find((template) => template.id === id) ?? PET_TEMPLATES[0]!;
}

/**
 * Desktop companion shared contract — activity phases, animation track names,
 * affinity/treat tuning and the reaction copy. The whale-girl behaviour is
 * ported from @linxin666/dsh-pet (Apache-2.0, (c) zhu1090093659,
 * https://github.com/zhu1090093659/dsh-web-ui). Sprite geometry lives with
 * the template registry (react-app/kernel/pet-templates.ts).
 */

export type ActivityPhase =
  | "idle"
  | "waiting"
  | "thinking"
  | "tool"
  | "review"
  | "done"
  | "failed";

export type PetAnimation =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export type PetInteraction = "pet" | "feed";

/** Celebration window after `done` before settling back to idle. */
export const PET_CELEBRATE_MS = 2400;

/** Local one-shot reaction animation played on pet/feed. */
export const PET_REACTION_ANIM_MS = 1400;

// ---------------------------------------------------------------------------
// Affinity (亲密度)
// ---------------------------------------------------------------------------

export const AFFINITY_MAX = 100;
export const AFFINITY_TURN_REWARD = 1;
export const AFFINITY_PET_REWARD = 1;
export const AFFINITY_PET_COOLDOWN_MS = 10_000;
export const AFFINITY_FEED_REWARD = 5;
export const AFFINITY_FEED_COOLDOWN_MS = 30_000;

export const AFFINITY_RANKS = [
  { min: 0, name: "幼鲸" },
  { min: 25, name: "伙伴" },
  { min: 50, name: "挚友" },
  { min: 80, name: "深海羁绊" },
] as const;

export const REACTION_PET = "咕噜咕噜～被摸摸好舒服！";
export const REACTION_PET_COOLDOWN = "摸过头啦，让{name}歇口气～";
export const REACTION_FEED = "呜哇！小鱼干好好吃！";
export const REACTION_FEED_COOLDOWN = "吃饱啦，晚点再喂～";
export const REACTION_FEED_EMPTY = "没有小鱼干了，多陪我工作一会儿吧～";

// ---------------------------------------------------------------------------
// Treats (小鱼干)
// ---------------------------------------------------------------------------

export const TREAT_TURNS_PER = 3;
export const TREAT_TIME_MS = 30 * 60_000;
export const TREAT_MAX = 20;

export const PET_NAME_MAX_LENGTH = 20;

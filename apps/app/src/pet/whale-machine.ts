/**
 * Whale-girl pure logic — activity state machine, affinity score and the
 * treat economy. Ported from @linxin666/dsh-pet (Apache-2.0,
 * (c) zhu1090093659). Everything here is a pure function of (input, nowMs);
 * rendering and persistence live elsewhere.
 */

import {
  AFFINITY_FEED_COOLDOWN_MS,
  AFFINITY_FEED_REWARD,
  AFFINITY_MAX,
  AFFINITY_PET_COOLDOWN_MS,
  AFFINITY_PET_REWARD,
  AFFINITY_RANKS,
  AFFINITY_TURN_REWARD,
  REACTION_FEED,
  REACTION_FEED_COOLDOWN,
  REACTION_PET,
  REACTION_PET_COOLDOWN,
  TREAT_MAX,
  TREAT_TIME_MS,
  TREAT_TURNS_PER,
  PET_CELEBRATE_MS,
  type ActivityPhase,
  type PetAnimation,
  type PetInteraction,
} from "./whale-contract";

// ---------------------------------------------------------------------------
// Activity state machine
// ---------------------------------------------------------------------------

export type PetActivityInput = {
  phase: ActivityPhase;
  /** Human-readable status line shown as the status bubble. */
  line?: string;
};

export type PetActivitySnapshot = {
  animation: PetAnimation;
  bubble?: string;
  phase: ActivityPhase;
  /** True once the companion has seen any activity (vs. freshly mounted). */
  sessionActive: boolean;
};

export function animationForPhase(phase: ActivityPhase): PetAnimation {
  switch (phase) {
    case "thinking":
      return "running";
    case "tool":
      return "running-right";
    case "review":
      return "review";
    case "waiting":
      return "waiting";
    case "done":
      return "jumping";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

/**
 * Holds the latest activity snapshot plus a one-shot celebration window
 * after `done`, so the pet visibly jumps before settling back to idle.
 */
export class PetStateMachine {
  private phase: ActivityPhase = "idle";
  private line: string | undefined;
  private sessionActive = false;
  private doneAt = 0;

  onActivity(input: PetActivityInput): void {
    this.phase = input.phase;
    this.line = input.line?.trim() || undefined;
    if (input.phase !== "idle") this.sessionActive = true;
    if (input.phase === "done") this.doneAt = Date.now();
  }

  render(nowMs = Date.now()): PetActivitySnapshot {
    let phase = this.phase;
    if (phase === "done" && nowMs - this.doneAt > PET_CELEBRATE_MS) {
      phase = "idle";
      this.phase = "idle";
    }
    const animation = animationForPhase(phase);
    return {
      animation,
      bubble: phase === "idle" ? undefined : this.line,
      phase,
      sessionActive: this.sessionActive,
    };
  }
}

// ---------------------------------------------------------------------------
// Affinity
// ---------------------------------------------------------------------------

export type AffinityState = {
  points: number;
  lastPetAt: number;
  lastFeedAt: number;
  pets: number;
  feeds: number;
  turns: number;
};

export function emptyAffinity(): AffinityState {
  return { points: 0, lastPetAt: 0, lastFeedAt: 0, pets: 0, feeds: 0, turns: 0 };
}

export function rankOf(points: number): (typeof AFFINITY_RANKS)[number] {
  let rank = AFFINITY_RANKS[0];
  for (const candidate of AFFINITY_RANKS) {
    if (points >= candidate.min) rank = candidate;
  }
  return rank;
}

export type InteractionOutcome = {
  affinity: AffinityState;
  delta: number;
  reaction: string;
  accepted: boolean;
};

function clampPoints(points: number): number {
  return Math.min(AFFINITY_MAX, Math.max(0, points));
}

export function applyInteraction(
  state: AffinityState,
  kind: PetInteraction,
  nowMs = Date.now(),
): InteractionOutcome {
  if (kind === "pet") {
    const inCooldown = state.lastPetAt !== 0 && nowMs - state.lastPetAt < AFFINITY_PET_COOLDOWN_MS;
    if (inCooldown) {
      return { affinity: state, delta: 0, reaction: REACTION_PET_COOLDOWN, accepted: false };
    }
    const next: AffinityState = {
      ...state,
      points: clampPoints(state.points + AFFINITY_PET_REWARD),
      lastPetAt: nowMs,
      pets: state.pets + 1,
    };
    return { affinity: next, delta: AFFINITY_PET_REWARD, reaction: REACTION_PET, accepted: true };
  }
  const inCooldown = state.lastFeedAt !== 0 && nowMs - state.lastFeedAt < AFFINITY_FEED_COOLDOWN_MS;
  if (inCooldown) {
    return { affinity: state, delta: 0, reaction: REACTION_FEED_COOLDOWN, accepted: false };
  }
  const next: AffinityState = {
    ...state,
    points: clampPoints(state.points + AFFINITY_FEED_REWARD),
    lastFeedAt: nowMs,
    feeds: state.feeds + 1,
  };
  return { affinity: next, delta: AFFINITY_FEED_REWARD, reaction: REACTION_FEED, accepted: true };
}

/** Reward one completed turn (called when a run finishes). */
export function applyTurnReward(state: AffinityState): AffinityState {
  return {
    ...state,
    points: clampPoints(state.points + AFFINITY_TURN_REWARD),
    turns: state.turns + 1,
  };
}

// ---------------------------------------------------------------------------
// Treats (小鱼干)
// ---------------------------------------------------------------------------

export type TreatLedger = {
  treats: number;
  lastTreatGrantAt: number;
  turnsAtLastTreatGrant: number;
};

export function emptyTreatLedger(): TreatLedger {
  return { treats: 0, lastTreatGrantAt: 0, turnsAtLastTreatGrant: 0 };
}

function capTreats(treats: number): number {
  return Math.min(TREAT_MAX, Math.max(0, treats));
}

/**
 * Lazy settlement: work output grants one treat per TREAT_TURNS_PER completed
 * turns, time output grants one per TREAT_TIME_MS of wall clock. Both anchors
 * advance independently; nothing backfills before the first settlement.
 */
export function settleTreatGrants(
  ledger: TreatLedger,
  turns: number,
  nowMs = Date.now(),
): { ledger: TreatLedger; gained: number } {
  let next = ledger;
  let gained = 0;

  if (ledger.lastTreatGrantAt === 0) {
    next = { ...next, lastTreatGrantAt: nowMs, turnsAtLastTreatGrant: turns };
  } else {
    const turnPeriods = Math.floor((turns - next.turnsAtLastTreatGrant) / TREAT_TURNS_PER);
    if (turnPeriods > 0) {
      next = {
        ...next,
        treats: capTreats(next.treats + turnPeriods),
        turnsAtLastTreatGrant: next.turnsAtLastTreatGrant + turnPeriods * TREAT_TURNS_PER,
      };
      gained += turnPeriods;
    }
    const timePeriods = Math.floor((nowMs - next.lastTreatGrantAt) / TREAT_TIME_MS);
    if (timePeriods > 0) {
      next = {
        ...next,
        treats: capTreats(next.treats + timePeriods),
        lastTreatGrantAt: next.lastTreatGrantAt + timePeriods * TREAT_TIME_MS,
      };
      gained += timePeriods;
    }
  }

  return { ledger: next, gained };
}

export function consumeTreat(ledger: TreatLedger): { ok: true; ledger: TreatLedger } | { ok: false } {
  if (ledger.treats <= 0) return { ok: false };
  return { ok: true, ledger: { ...ledger, treats: ledger.treats - 1 } };
}

/**
 * Companion persistence — one localStorage record holding the affinity score
 * and the treat ledger. Tolerant read: a missing or corrupt record falls
 * back to defaults. The pet's nickname lives in the desktop pet config
 * (main-process owned), not here; affinity/treats are shared across
 * templates.
 */

import {
  emptyAffinity,
  emptyTreatLedger,
  type AffinityState,
  type TreatLedger,
} from "./whale-machine";

const STORAGE_KEY = "ipollowork.pet.whale.v1";

export type WhaleCompanionState = {
  affinity: AffinityState;
  treats: TreatLedger;
};

export function defaultWhaleCompanion(): WhaleCompanionState {
  return { affinity: emptyAffinity(), treats: emptyTreatLedger() };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function loadWhaleCompanion(): WhaleCompanionState {
  const fallback = defaultWhaleCompanion();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    const record = parsed as Record<string, unknown>;
    const affinity = (record.affinity ?? {}) as Record<string, unknown>;
    const treats = (record.treats ?? {}) as Record<string, unknown>;
    return {
      affinity: {
        points: finiteNumber(affinity.points, 0),
        lastPetAt: finiteNumber(affinity.lastPetAt, 0),
        lastFeedAt: finiteNumber(affinity.lastFeedAt, 0),
        pets: finiteNumber(affinity.pets, 0),
        feeds: finiteNumber(affinity.feeds, 0),
        turns: finiteNumber(affinity.turns, 0),
      },
      treats: {
        treats: finiteNumber(treats.treats, 0),
        lastTreatGrantAt: finiteNumber(treats.lastTreatGrantAt, 0),
        turnsAtLastTreatGrant: finiteNumber(treats.turnsAtLastTreatGrant, 0),
      },
    };
  } catch {
    return fallback;
  }
}

export function saveWhaleCompanion(state: WhaleCompanionState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode); the pet still works
    // for the session, it just forgets across restarts.
  }
}

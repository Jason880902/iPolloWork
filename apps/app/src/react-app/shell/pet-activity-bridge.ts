import { useEffect } from "react";

import { petActivity } from "@/app/lib/desktop";
import { isDesktopRuntime } from "@/app/utils";
import {
  useSessionActivityStore,
  type SessionActivityStatus,
} from "../domains/session/status/session-activity-store";

type PetActivityPhase = "idle" | "waiting" | "thinking" | "tool" | "review" | "done" | "failed";

type ActivityRecord = {
  status: SessionActivityStatus;
  runActive: boolean;
  errorActive: boolean;
};

const PHASE_LINE: Record<Exclude<PetActivityPhase, "idle" | "done">, string> = {
  thinking: "正在思考",
  tool: "正在使用工具",
  review: "整理回复中",
  waiting: "等待继续",
  failed: "执行失败",
};

/**
 * Aggregate all per-session activity records into one pet phase. Priority:
 * failure > waiting on the user > working (thinking/compacting) > streaming
 * an answer > idle.
 */
function aggregatePhase(statuses: SessionActivityStatus[]): { phase: PetActivityPhase; line?: string } {
  if (statuses.includes("error")) return { phase: "failed", line: PHASE_LINE.failed };
  if (statuses.includes("waiting")) return { phase: "waiting", line: PHASE_LINE.waiting };
  if (statuses.includes("thinking") || statuses.includes("compacting")) {
    return { phase: "thinking", line: PHASE_LINE.thinking };
  }
  if (statuses.includes("responding")) return { phase: "review", line: PHASE_LINE.review };
  return { phase: "idle" };
}

function collectRecords(
  recordsByWorkspaceId: Record<string, Record<string, ActivityRecord>>,
): Map<string, ActivityRecord> {
  const records = new Map<string, ActivityRecord>();
  for (const workspaceId of Object.keys(recordsByWorkspaceId)) {
    const workspace = recordsByWorkspaceId[workspaceId];
    for (const sessionId of Object.keys(workspace)) {
      records.set(`${workspaceId}/${sessionId}`, workspace[sessionId]!);
    }
  }
  return records;
}

/**
 * Mirrors the session activity store into the floating pet window: the pet's
 * animation follows what the agent is doing, and every completed run feeds
 * the whale's affinity/treat economy (turnCompleted).
 */
export function usePetActivityBridge() {
  useEffect(() => {
    if (!isDesktopRuntime()) return;

    let prevRecords = new Map<string, ActivityRecord>();
    let lastSignature = "";

    const push = (recordsByWorkspaceId: Record<string, Record<string, ActivityRecord>>) => {
      const records = collectRecords(recordsByWorkspaceId);
      // A turn completed when a session leaves runActive without an error.
      let completedTurns = 0;
      for (const [key, next] of records) {
        const prev = prevRecords.get(key);
        if (prev?.runActive && !next.runActive && !next.errorActive) completedTurns += 1;
      }
      prevRecords = records;

      const aggregate = aggregatePhase([...records.values()].map((record) => record.status));
      const celebrating = completedTurns > 0 && aggregate.phase === "idle";
      const phase = celebrating ? "done" : aggregate.phase;
      const line = celebrating ? "完成啦" : aggregate.line;
      const signature = `${phase}:${line ?? ""}:${completedTurns > 0 ? "1" : "0"}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      void petActivity({
        phase,
        ...(line ? { line } : {}),
        ...(completedTurns > 0 ? { turnCompleted: true } : {}),
      }).catch(() => undefined);
    };

    push(useSessionActivityStore.getState().recordsByWorkspaceId);
    const unsubscribe = useSessionActivityStore.subscribe((state) => {
      push(state.recordsByWorkspaceId);
    });
    return unsubscribe;
  }, []);
}

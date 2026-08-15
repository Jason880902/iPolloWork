import { watch } from "node:fs";
import { readFile } from "node:fs/promises";

const PET_EVENT_DEDUPE_MS = 30_000;
const PET_TASK_TICK_MS = 60_000;

// Task list format (pet-tasks.md): one item per line, GitHub-style checkbox,
// optional due tag. Example:
//   - [ ] 给销售团队过 Q3 定价方案 @due 2026-08-16 10:00
//   - [x] 已完成的事项
const TASK_LINE_RE = /^\s*-\s*\[( |x|X)\]\s*(.+?)(?:\s+@due\s+(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?)?\s*$/;

function copyForPetEvent(input) {
  const detail = typeof input.detail === "string" ? input.detail.trim() : "";
  switch (input.type) {
    case "task.completed":
      return { kind: "praise", text: "任务跑完啦，韩大哥出品就是稳！" };
    case "task.failed":
      return { kind: "reminder", text: detail ? `有个任务出错了：${detail}` : "有个任务出错了，等你有空看一眼。" };
    case "permission.asked":
      return { kind: "decision", text: detail ? `等你拍板：${detail}` : "有个权限申请在等你确认，助手才能继续。" };
    case "question.asked":
      return { kind: "decision", text: detail ? `助手在等你的答案：${detail}` : "助手有个问题在等你回答。" };
    default:
      return null;
  }
}

export function createPetAssistant({ petWindow, taskFilePath }) {
  const recentEvents = new Map();
  let taskWatcher = null;
  let taskTick = null;
  const taskState = new Map();
  const remindedTasks = new Set();

  function handleDesktopEvent(input) {
    const copy = copyForPetEvent(input ?? {});
    if (!copy) return { ok: false, reason: "unsupported event type" };
    const sessionId = typeof input.sessionId === "string" ? input.sessionId : "";
    const dedupeKey = `${input.type}:${sessionId}:${copy.text}`;
    const now = Date.now();
    const lastShownAt = recentEvents.get(dedupeKey) ?? 0;
    if (now - lastShownAt < PET_EVENT_DEDUPE_MS) {
      return { ok: false, reason: "deduplicated" };
    }
    recentEvents.set(dedupeKey, now);
    if (recentEvents.size > 200) {
      for (const [key, at] of recentEvents) {
        if (now - at > PET_EVENT_DEDUPE_MS * 2) recentEvents.delete(key);
      }
    }
    petWindow.showBubble({
      id: `event-${now}`,
      kind: copy.kind,
      text: copy.text,
      ttlMs: copy.kind === "decision" ? 12_000 : 8_000,
    });
    return { ok: true };
  }

  function parseTasks(content) {
    const tasks = [];
    for (const line of content.split("\n")) {
      const match = TASK_LINE_RE.exec(line);
      if (!match) continue;
      const [, mark, text, date, hour, minute] = match;
      let dueAt = null;
      if (date) {
        const d = new Date(`${date}T${(hour ?? "09").padStart(2, "0")}:${minute ?? "00"}:00`);
        if (Number.isFinite(d.getTime())) dueAt = d.getTime();
      }
      tasks.push({ done: mark !== " ", text, dueAt, key: text });
    }
    return tasks;
  }

  async function pollTasks() {
    let content;
    try {
      content = await readFile(taskFilePath, "utf8");
    } catch {
      return;
    }
    const now = Date.now();
    for (const task of parseTasks(content)) {
      const wasDone = taskState.get(task.key);
      if (wasDone === false && task.done) {
        petWindow.showBubble({
          id: `task-done-${now}`,
          kind: "praise",
          text: `「${task.text}」搞定了，太棒了！`,
          ttlMs: 8_000,
        });
      }
      taskState.set(task.key, task.done);
      if (!task.done && task.dueAt !== null && task.dueAt <= now && !remindedTasks.has(task.key)) {
        remindedTasks.add(task.key);
        petWindow.showBubble({
          id: `task-due-${now}`,
          kind: "reminder",
          text: `到点了：「${task.text}」该推进啦。`,
          ttlMs: 12_000,
        });
      }
      if (task.done) {
        remindedTasks.delete(task.key);
      }
    }
  }

  function start() {
    try {
      taskWatcher = watch(taskFilePath, () => void pollTasks());
      taskWatcher.on("error", () => undefined);
    } catch {
      taskWatcher = null;
    }
    taskTick = setInterval(() => void pollTasks(), PET_TASK_TICK_MS);
    taskTick.unref?.();
    void pollTasks();
  }

  function stop() {
    taskWatcher?.close();
    taskWatcher = null;
    if (taskTick) clearInterval(taskTick);
    taskTick = null;
  }

  return { handleDesktopEvent, start, stop };
}

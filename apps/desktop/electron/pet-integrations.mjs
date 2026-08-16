import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

const INTEGRATIONS_FILE = "pet-integrations.json";
const CHECK_INTERVAL_MS = 10 * 60_000;

// MCP servers (lark-mcp / dingtalk-mcp) own platform credentials and API
// calls. This module only owns the proactive-reminder schedule: on each tick
// it asks the companion session (which has MCP tools) to check for pending
// items, and bubbles the summary when there is something actionable.
const CHECK_PROMPT =
  "请用你可用的钉钉/飞书工具检查：有没有等我处理的待办、审批或日程提醒。" +
  "如果有，用一句话（不超过50字）概括最重要的事项；如果没有，只回复 NONE。";

const NONE_RE = /^\s*NONE\s*$/;

function normalizeState(value) {
  const record = value && typeof value === "object" ? value : {};
  return {
    autoCheck: Reflect.get(record, "autoCheck") === true,
  };
}

export function createPetIntegrations({ petWindow, getMainWindow }) {
  let state = normalizeState(null);
  let timer = null;
  let checking = false;

  function filePath() {
    return path.join(app.getPath("userData"), INTEGRATIONS_FILE);
  }

  async function load() {
    try {
      const raw = await readFile(filePath(), "utf8");
      state = normalizeState(JSON.parse(raw));
    } catch {
      // keep defaults
    }
  }

  async function persist() {
    try {
      await writeFile(filePath(), JSON.stringify(state, null, 2), "utf8");
    } catch (error) {
      console.warn("[pet] failed to persist integrations", error);
    }
  }

  async function setAutoCheck(input) {
    state = { autoCheck: input?.enabled === true };
    await persist();
    return { ok: true, state: { ...state } };
  }

  function getPublicState() {
    return { ...state };
  }

  // The companion treats MCP check answers as bubbles (or silence), not chat.
  function handleCheckReply(text) {
    if (!text || NONE_RE.test(text)) return;
    petWindow.showBubble({
      id: `mcp-check-${Date.now()}`,
      kind: "decision",
      text: text.slice(0, 140),
      ttlMs: 15_000,
      action: { type: "open-url", url: "dingtalk://" },
    });
  }

  async function pollOnce() {
    if (checking || !state.autoCheck) return;
    const mainWin = getMainWindow();
    if (!mainWin || mainWin.isDestroyed()) return;
    checking = true;
    try {
      mainWin.webContents.send("ipollowork:pet:chat-request", {
        id: `mcp-check-${Date.now()}`,
        text: CHECK_PROMPT,
        internal: true,
      });
    } finally {
      checking = false;
    }
  }

  async function start() {
    await load();
    timer = setInterval(() => void pollOnce(), CHECK_INTERVAL_MS);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { getPublicState, setAutoCheck, handleCheckReply, start, stop };
}

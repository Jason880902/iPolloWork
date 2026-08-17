// Real git operations against a workspace checkout, wired as a factory
// (createGitOps pattern) so it stays unit-testable like git-graph.mjs /
// scheduled-tasks.mjs. Every command returns a { ok, ... } / { ok:false, error }
// result instead of throwing so the IPC layer can surface git errors to the UI.
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCallback);

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024;

function stripQuotes(file) {
  if (file.startsWith('"') && file.endsWith('"')) return file.slice(1, -1);
  return file;
}

export function parseStatus(output) {
  const staged = [];
  const unstaged = [];
  const untracked = [];
  const conflicted = [];
  let branch = null;

  for (const line of output.split("\n")) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      branch = line.slice(3).trim();
      continue;
    }
    if (line.length < 4) continue;
    const x = line[0];
    const y = line[1];
    let file = line.slice(3).trim();
    // Renames print as "old -> new"; keep the new path so diff/stage work.
    if (x === "R" || y === "R") {
      const arrow = file.indexOf(" -> ");
      if (arrow >= 0) file = file.slice(arrow + 4).trim();
    }
    file = stripQuotes(file);

    if (x === "?" && y === "?") {
      untracked.push(file);
      continue;
    }
    // Unmerged states (all 7 porcelain v1 combinations) count as conflicts.
    if (/^(DD|AU|UD|UA|DU|AA|UU)$/.test(x + y)) {
      conflicted.push(file);
      continue;
    }
    if (x !== " " && x !== "?") staged.push(file);
    if (y !== " " && y !== "?") unstaged.push(file);
  }

  return { branch, staged, unstaged, untracked, conflicted };
}

export function createGitOps({ execFile: execFileImpl = execFileAsync } = {}) {
  async function runGit(cwd, args) {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "", LC_ALL: "C" };
    const result = await execFileImpl("git", args, {
      cwd,
      encoding: "utf8",
      timeout: DEFAULT_TIMEOUT_MS,
      maxBuffer: DEFAULT_MAX_BUFFER,
      env,
    });
    return String(result.stdout ?? "");
  }

  async function runGitSafe(cwd, args) {
    try {
      const output = await runGit(cwd, args);
      return { ok: true, output };
    } catch (error) {
      const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr ?? "") : "";
      const message = error instanceof Error ? error.message : String(error);
      const combined = (stderr || message).trim();
      return { ok: false, error: combined || "git 命令执行失败" };
    }
  }

  async function status(cwd) {
    const result = await runGitSafe(cwd, ["status", "--porcelain=v1", "--branch", "-uall"]);
    if (!result.ok) return result;
    return { ok: true, ...parseStatus(result.output) };
  }

  async function diff(cwd, options = {}) {
    const { staged = false, file = null } = options;
    const args = ["diff"];
    if (staged) args.push("--cached");
    if (file) args.push("--", file);
    const result = await runGitSafe(cwd, args);
    if (!result.ok) return result;
    return { ok: true, diff: result.output };
  }

  async function stage(cwd, files) {
    if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "没有要暂存的文件" };
    return runGitSafe(cwd, ["add", "--", ...files]);
  }

  async function unstage(cwd, files) {
    if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "没有要取消暂存的文件" };
    return runGitSafe(cwd, ["restore", "--staged", "--", ...files]);
  }

  async function commit(cwd, message) {
    const msg = String(message ?? "").trim();
    if (!msg) return { ok: false, error: "commit message 不能为空" };
    return runGitSafe(cwd, ["commit", "-m", msg]);
  }

  async function push(cwd) {
    const upstream = await runGitSafe(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    if (upstream.ok) return runGitSafe(cwd, ["push"]);
    return runGitSafe(cwd, ["push", "-u", "origin", "HEAD"]);
  }

  async function pull(cwd) {
    return runGitSafe(cwd, ["pull", "--ff-only"]);
  }

  async function branches(cwd) {
    const result = await runGitSafe(cwd, ["branch", "--list"]);
    if (!result.ok) return result;
    const branches = [];
    let current = null;
    for (const line of result.output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("*")) {
        current = trimmed.slice(1).trim();
        branches.push({ name: current, current: true });
      } else {
        branches.push({ name: trimmed, current: false });
      }
    }
    return { ok: true, branches, current };
  }

  async function checkout(cwd, branch) {
    const target = String(branch ?? "").trim();
    if (!target) return { ok: false, error: "分支名不能为空" };
    return runGitSafe(cwd, ["checkout", target]);
  }

  async function createBranch(cwd, name) {
    const target = String(name ?? "").trim();
    if (!target) return { ok: false, error: "分支名不能为空" };
    return runGitSafe(cwd, ["checkout", "-b", target]);
  }

  return { status, diff, stage, unstage, commit, push, pull, branches, checkout, createBranch };
}

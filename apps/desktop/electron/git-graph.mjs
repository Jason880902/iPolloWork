// Git graph DAG builder: commit DAG + ref mapping for the swimlane panel.
// Extracted from main.mjs into a factory so it can be unit-tested in
// isolation against real or fake git executables. Git commands run async so
// large repositories never block the Electron main process.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const GIT_GRAPH_TIMEOUT_MS = 30_000;
const execFileAsync = promisify(execFile);

export function createGitGraph({ execFile: execFileImpl = execFileAsync } = {}) {
  async function runGitInWorkspace(cwd, args) {
    let result;
    try {
      result = await execFileImpl("git", args, {
        cwd,
        encoding: "utf8",
        timeout: GIT_GRAPH_TIMEOUT_MS,
        maxBuffer: 128 * 1024 * 1024,
        env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "" },
      });
    } catch (error) {
      const code = error && typeof error.code === "number" ? error.code : null;
      if (code === "ENOENT") throw new Error("git executable not found");
      if (code) throw new Error(`git ${args[0]} failed: ${String(error.stderr ?? "").trim().slice(0, 400)}`);
      throw error;
    }
    return String(result.stdout ?? "");
  }

  // Build a lightweight commit DAG for the workspace repo: commit hashes with
  // their parents plus branch/tag refs. Uses `rev-list --parents` for exact
  // edges and `for-each-ref` for ref → commit mapping. Bounded by an optional
  // maxCommits to keep huge repos renderable.
  async function buildGitGraph(cwd, maxCommits = 2000) {
    const revListOutput = await runGitInWorkspace(cwd, [
      "rev-list", "--parents", "--all", "--max-count", String(maxCommits),
    ]);
    const commits = [];
    for (const line of revListOutput.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      const sha = parts[0];
      const parents = parts.slice(1);
      commits.push({ sha, parents });
    }

    const refsOutput = await runGitInWorkspace(cwd, [
      "for-each-ref", "refs/heads", "refs/remotes",
      "--format=%(objectname)%00%(refname)%00%(HEAD)", "--merged", "HEAD",
    ]);
    const refs = [];
    for (const line of refsOutput.split("\n")) {
      if (!line.trim()) continue;
      const [sha, refname, headFlag] = line.trim().split("\0");
      if (!sha || !refname) continue;
      const head = headFlag === "*";
      refs.push({ sha, refname, head });
    }

    const count = commits.length;
    const headShas = new Set(refs.filter((ref) => ref.head).map((ref) => ref.sha));

    // Detect truncation: rev-list --max-count cannot tell us whether more
    // commits exist, so ask for the total once.
    let truncated = false;
    let totalCount = null;
    if (commits.length > 0) {
      try {
        const countOutput = await runGitInWorkspace(cwd, ["rev-list", "--all", "--count"]);
        const parsed = Number.parseInt(String(countOutput).trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          totalCount = parsed;
          truncated = parsed > commits.length;
        }
      } catch {
        // Total-count probe failed; leave truncated=false.
      }
    }

    return {
      ok: true,
      repoRoot: cwd,
      count,
      totalCount,
      truncated,
      commits,
      refs,
      headShas: [...headShas],
    };
  }

  return { runGitInWorkspace, buildGitGraph };
}

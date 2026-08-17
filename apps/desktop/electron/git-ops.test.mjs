import assert from "node:assert/strict";
import { test } from "node:test";

import { createGitOps, parseStatus } from "./git-ops.mjs";

function fakeExec(responder) {
  const calls = [];
  const fn = (program, args, options) => {
    calls.push({ program, args, options });
    return Promise.resolve(responder(program, args, options));
  };
  return { fn, calls };
}

function fakeExecError(stderr, message = "git failed") {
  const calls = [];
  const fn = (program, args, options) => {
    calls.push({ program, args, options });
    const err = new Error(message);
    err.stderr = stderr;
    return Promise.reject(err);
  };
  return { fn, calls };
}

test("parseStatus groups files by area", () => {
  const out = "## feat/foo...origin/feat/foo [ahead 1]\n M unstaged.txt\nM  staged.txt\nMM both.txt\nA  added.txt\nD  deleted.txt\nUU conflicted.txt\n?? untracked.txt\n";
  const s = parseStatus(out);
  assert.equal(s.branch, "feat/foo...origin/feat/foo [ahead 1]");
  assert.deepEqual(s.untracked, ["untracked.txt"]);
  assert.deepEqual(s.conflicted, ["conflicted.txt"]);
  assert.ok(s.staged.includes("staged.txt"));
  assert.ok(s.staged.includes("both.txt"));
  assert.ok(s.staged.includes("added.txt"));
  assert.ok(s.staged.includes("deleted.txt"));
  assert.ok(s.unstaged.includes("unstaged.txt"));
  assert.ok(s.unstaged.includes("both.txt"));
});

test("status runs porcelain v1 with branch and parses", async () => {
  const { fn, calls } = fakeExec(() => ({ stdout: "## main\n M a.txt\n" }));
  const ops = createGitOps({ execFile: fn });
  const result = await ops.status("/ws");
  assert.equal(result.ok, true);
  assert.equal(result.branch, "main");
  assert.deepEqual(result.unstaged, ["a.txt"]);
  assert.deepEqual(calls[0].args, ["status", "--porcelain=v1", "--branch", "-uall"]);
  assert.equal(calls[0].options.cwd, "/ws");
});

test("diff passes staged and file flags", async () => {
  const { fn, calls } = fakeExec(() => ({ stdout: "diff body" }));
  const ops = createGitOps({ execFile: fn });
  await ops.diff("/ws");
  assert.deepEqual(calls[0].args, ["diff"]);
  await ops.diff("/ws", { staged: true });
  assert.deepEqual(calls[1].args, ["diff", "--cached"]);
  await ops.diff("/ws", { file: "a.txt" });
  assert.deepEqual(calls[2].args, ["diff", "--", "a.txt"]);
});

test("stage/unstage pass file args", async () => {
  const { fn, calls } = fakeExec(() => ({ stdout: "" }));
  const ops = createGitOps({ execFile: fn });
  await ops.stage("/ws", ["a.txt", "b.txt"]);
  assert.deepEqual(calls[0].args, ["add", "--", "a.txt", "b.txt"]);
  await ops.unstage("/ws", ["a.txt"]);
  assert.deepEqual(calls[1].args, ["restore", "--staged", "--", "a.txt"]);
});

test("commit rejects empty message", async () => {
  const { fn, calls } = fakeExec(() => ({ stdout: "" }));
  const ops = createGitOps({ execFile: fn });
  const result = await ops.commit("/ws", "   ");
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("commit passes message as single arg", async () => {
  const { fn, calls } = fakeExec(() => ({ stdout: "[main abc] msg" }));
  const ops = createGitOps({ execFile: fn });
  const result = await ops.commit("/ws", "fix: thing");
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0].args, ["commit", "-m", "fix: thing"]);
});

test("push/pull pass expected args", async () => {
  const { fn, calls } = fakeExec(() => ({ stdout: "" }));
  const ops = createGitOps({ execFile: fn });
  await ops.push("/ws");
  assert.deepEqual(calls[0].args, ["push"]);
  await ops.pull("/ws");
  assert.deepEqual(calls[1].args, ["pull", "--ff-only"]);
});

test("branches identifies current branch", async () => {
  const { fn, calls } = fakeExec(() => ({ stdout: "* feat/foo\n  main\n  feat/bar\n" }));
  const ops = createGitOps({ execFile: fn });
  const result = await ops.branches("/ws");
  assert.equal(result.current, "feat/foo");
  assert.deepEqual(result.branches.map((b) => b.name), ["feat/foo", "main", "feat/bar"]);
  assert.deepEqual(calls[0].args, ["branch", "--list"]);
});

test("checkout/createBranch reject empty name", async () => {
  const { fn, calls } = fakeExec(() => ({ stdout: "" }));
  const ops = createGitOps({ execFile: fn });
  assert.equal((await ops.checkout("/ws", " ")).ok, false);
  assert.equal((await ops.createBranch("/ws", "")).ok, false);
  assert.equal(calls.length, 0);
});

test("checkout/createBranch pass args", async () => {
  const { fn, calls } = fakeExec(() => ({ stdout: "" }));
  const ops = createGitOps({ execFile: fn });
  await ops.checkout("/ws", "main");
  assert.deepEqual(calls[0].args, ["checkout", "main"]);
  await ops.createBranch("/ws", "feat/new");
  assert.deepEqual(calls[1].args, ["checkout", "-b", "feat/new"]);
});

test("git failure surfaces stderr as error", async () => {
  const { fn } = fakeExecError("fatal: not a git repository");
  const ops = createGitOps({ execFile: fn });
  const result = await ops.status("/ws");
  assert.equal(result.ok, false);
  assert.ok(result.error.includes("not a git repository"));
});

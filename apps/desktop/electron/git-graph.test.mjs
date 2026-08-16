import assert from "node:assert/strict";
import { test } from "node:test";

import { createGitGraph } from "./git-graph.mjs";

// A fake execFile that returns canned git output keyed by command.
function gitWithOutput({ revList, refs, count }) {
  const calls = [];
  const execFileImpl = async (_cmd, args) => {
    calls.push(args);
    const stdoutFor = () => {
      if (args[0] === "rev-list" && args.includes("--max-count")) return revList;
      if (args[0] === "rev-list" && args.includes("--count")) return count ?? "";
      if (args[0] === "for-each-ref") return refs ?? "";
      return "";
    };
    return { stdout: stdoutFor() };
  };
  return { graph: createGitGraph({ execFile: execFileImpl }), calls };
}

test("buildGitGraph parses commit DAG with parents", async () => {
  const { graph } = gitWithOutput({
    revList: "aaa111 parent1 parent2\nbbb222 parent3\nccc333\n",
    refs: "",
    count: "3",
  });
  const result = await graph.buildGitGraph("/repo");
  assert.equal(result.ok, true);
  assert.equal(result.count, 3);
  assert.deepEqual(result.commits[0], { sha: "aaa111", parents: ["parent1", "parent2"] });
  assert.deepEqual(result.commits[2], { sha: "ccc333", parents: [] });
});

test("buildGitGraph maps refs and HEAD flag", async () => {
  const { graph } = gitWithOutput({
    revList: "aaa111 parent1\n",
    refs: "aaa111\x00refs/heads/main\x00*\naaa111\x00refs/remotes/origin/main\x00 \n",
    count: "1",
  });
  const result = await graph.buildGitGraph("/repo");
  assert.deepEqual(result.headShas, ["aaa111"]);
  assert.deepEqual(result.refs, [
    { sha: "aaa111", refname: "refs/heads/main", head: true },
    { sha: "aaa111", refname: "refs/remotes/origin/main", head: false },
  ]);
});

test("buildGitGraph reports truncation when total exceeds window", async () => {
  const { graph } = gitWithOutput({
    revList: "aaa111\nbbb222\n",
    refs: "",
    count: "100",
  });
  const result = await graph.buildGitGraph("/repo", 2);
  assert.equal(result.truncated, true);
  assert.equal(result.totalCount, 100);
  assert.equal(result.count, 2);
});

test("buildGitGraph is not truncated when total fits in window", async () => {
  const { graph } = gitWithOutput({
    revList: "aaa111\nbbb222\n",
    refs: "",
    count: "2",
  });
  const result = await graph.buildGitGraph("/repo", 2000);
  assert.equal(result.truncated, false);
  assert.equal(result.totalCount, 2);
});

test("buildGitGraph tolerates a failing total-count probe", async () => {
  const execFileImpl = async (_cmd, args) => {
    if (args[0] === "rev-list" && args.includes("--count")) {
      const error = new Error("git rev-list failed");
      error.code = 128;
      error.stderr = "fatal: permission";
      throw error;
    }
    return { stdout: "aaa111\n" };
  };
  const graph = createGitGraph({ execFile: execFileImpl });
  const result = await graph.buildGitGraph("/repo");
  assert.equal(result.ok, true);
  assert.equal(result.truncated, false);
  assert.equal(result.totalCount, null);
});

test("buildGitGraph propagates git failure", async () => {
  const execFileImpl = async () => {
    const error = new Error("git rev-list failed");
    error.code = 128;
    error.stderr = "fatal: not a git repository";
    throw error;
  };
  const graph = createGitGraph({ execFile: execFileImpl });
  await assert.rejects(() => graph.buildGitGraph("/not-a-repo"), /not a git repository/);
});

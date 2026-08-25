import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_BRANCH,
  DEFAULT_STALE_DAYS,
  MS_PER_DAY,
  createGitHubClient,
  decideBranch,
  deleteUnusedBranchesMainForTest,
  formatDecision,
  githubRefPath,
  groupPullsByHead,
  parseDeleteUnusedArgs,
  planUnusedBranches,
  resolveRepo,
  type BranchSnapshot,
  type DeleteUnusedMode,
  type GitHubClient,
  type RemoteBranch,
  type RemotePull,
} from "./delete-unused-branches.ts";

const root = path.resolve(import.meta.dir, "..");
const nowMs = Date.parse("2026-08-25T00:00:00.000Z");

function branch(partial: Partial<BranchSnapshot> & Pick<BranchSnapshot, "name">): BranchSnapshot {
  return {
    protected: false,
    lastCommitMs: nowMs,
    pulls: [],
    ...partial,
  };
}

function decide(
  snapshot: BranchSnapshot,
  mode: DeleteUnusedMode = { kind: "sweep" },
  staleDays = DEFAULT_STALE_DAYS,
) {
  return decideBranch({
    branch: snapshot,
    defaultBranch: DEFAULT_BRANCH,
    staleDays,
    nowMs,
    mode,
  });
}

describe("parseDeleteUnusedArgs", () => {
  test("defaults to a dry-run sweep", () => {
    expect(parseDeleteUnusedArgs([])).toEqual({
      apply: false,
      staleDays: DEFAULT_STALE_DAYS,
      defaultBranch: DEFAULT_BRANCH,
      repo: undefined,
      mode: { kind: "sweep" },
    });
  });

  test("accepts apply, closed-head, and overrides", () => {
    expect(
      parseDeleteUnusedArgs([
        "--apply",
        "--closed-head",
        "cursor/foo-e0a5",
        "--stale-days",
        "7",
        "--default-branch",
        "main",
        "--repo",
        "alexzhang1030/rclweb",
      ]),
    ).toEqual({
      apply: true,
      staleDays: 7,
      defaultBranch: "main",
      repo: "alexzhang1030/rclweb",
      mode: { kind: "closed-head", head: "cursor/foo-e0a5" },
    });
  });

  test("rejects apply together with dry-run", () => {
    expect(parseDeleteUnusedArgs(["--apply", "--dry-run"])).toEqual({
      error: expect.stringContaining("usage:"),
    });
  });

  test("rejects a non-positive stale-days value", () => {
    expect(parseDeleteUnusedArgs(["--stale-days", "0"])).toEqual({
      error: expect.stringContaining("usage:"),
    });
  });
});

describe("resolveRepo", () => {
  test("accepts owner/name from the flag or GITHUB_REPOSITORY", () => {
    expect(resolveRepo("alexzhang1030/rclweb", undefined)).toBe("alexzhang1030/rclweb");
    expect(resolveRepo(undefined, "alexzhang1030/rclweb")).toBe("alexzhang1030/rclweb");
  });

  test("rejects a missing or malformed repo", () => {
    expect(resolveRepo(undefined, undefined)).toEqual({ error: expect.stringContaining("GITHUB_REPOSITORY") });
    expect(resolveRepo("rclweb", undefined)).toEqual({ error: expect.stringContaining("owner/name") });
  });
});

describe("decideBranch", () => {
  test("never deletes the default branch", () => {
    expect(decide(branch({ name: "main", protected: true }))).toEqual({
      action: "keep",
      reason: "default-branch",
    });
    expect(decide(branch({ name: "main" }), { kind: "closed-head", head: "main" })).toEqual({
      action: "keep",
      reason: "default-branch",
    });
  });

  test("keeps a protected branch", () => {
    expect(decide(branch({ name: "release-hold", protected: true }))).toEqual({
      action: "keep",
      reason: "protected",
    });
  });

  test("keeps a branch that still has an open pull request", () => {
    expect(
      decide(
        branch({
          name: "cursor/open-e0a5",
          pulls: [{ number: 1, state: "open", merged: false }],
        }),
      ),
    ).toEqual({ action: "keep", reason: "open-pr" });
  });

  test("deletes a leftover merged head even when the tip is recent", () => {
    expect(
      decide(
        branch({
          name: "cursor/merged-e0a5",
          lastCommitMs: nowMs,
          pulls: [{ number: 2, state: "closed", merged: true }],
        }),
      ),
    ).toEqual({ action: "delete", reason: "merged-pr" });
  });

  test("prefers an open pull request over a previous merge on the same name", () => {
    expect(
      decide(
        branch({
          name: "cursor/reused-e0a5",
          pulls: [
            { number: 3, state: "closed", merged: true },
            { number: 4, state: "open", merged: false },
          ],
        }),
      ),
    ).toEqual({ action: "keep", reason: "open-pr" });
  });

  test("deletes an abandoned branch with no pull request after 14 days", () => {
    expect(
      decide(
        branch({
          name: "cursor/abandoned-e0a5",
          lastCommitMs: nowMs - DEFAULT_STALE_DAYS * MS_PER_DAY,
        }),
      ),
    ).toEqual({ action: "delete", reason: "stale-no-pr" });
  });

  test("keeps a no-PR branch that is still younger than the stale window", () => {
    expect(
      decide(
        branch({
          name: "cursor/fresh-e0a5",
          lastCommitMs: nowMs - (DEFAULT_STALE_DAYS * MS_PER_DAY - 1),
        }),
      ),
    ).toEqual({ action: "keep", reason: "recent-no-pr" });
  });

  test("keeps a recently closed unmerged head until the stale window", () => {
    expect(
      decide(
        branch({
          name: "cursor/closed-e0a5",
          lastCommitMs: nowMs,
          pulls: [{ number: 5, state: "closed", merged: false }],
        }),
      ),
    ).toEqual({ action: "keep", reason: "recent-no-pr" });
  });

  test("deletes the named head on the pull_request closed path", () => {
    expect(decide(branch({ name: "cursor/closed-e0a5" }), { kind: "closed-head", head: "cursor/closed-e0a5" })).toEqual({
      action: "delete",
      reason: "closed-head",
    });
  });
});

describe("formatDecision", () => {
  test("prints keep and delete lines", () => {
    expect(formatDecision("main", { action: "keep", reason: "default-branch" })).toBe("keep main (default-branch)");
    expect(formatDecision("cursor/foo-e0a5", { action: "delete", reason: "merged-pr" })).toBe(
      "delete cursor/foo-e0a5 (merged-pr)",
    );
  });
});

describe("groupPullsByHead", () => {
  test("groups pull requests by head ref", () => {
    const grouped = groupPullsByHead([
      { number: 1, state: "open", merged: false, headRef: "cursor/a-e0a5" },
      { number: 2, state: "closed", merged: true, headRef: "cursor/a-e0a5" },
      { number: 3, state: "closed", merged: false, headRef: "cursor/b-e0a5" },
    ]);
    expect(grouped.get("cursor/a-e0a5")?.map((pull) => pull.number)).toEqual([1, 2]);
    expect(grouped.get("cursor/b-e0a5")?.map((pull) => pull.number)).toEqual([3]);
  });
});

describe("githubRefPath", () => {
  test("encodes slashes in cursor branch names", () => {
    expect(githubRefPath("cursor/foo-e0a5")).toBe("heads/cursor/foo-e0a5");
    expect(githubRefPath("heads-only")).toBe("heads/heads-only");
  });
});

function fakeClient(input: {
  branches?: RemoteBranch[];
  pulls?: RemotePull[];
  commitMs?: Record<string, number>;
  deletes?: string[];
}): GitHubClient {
  const deletes = input.deletes ?? [];
  return {
    async listBranches() {
      return input.branches ?? [];
    },
    async listPulls() {
      return input.pulls ?? [];
    },
    async commitTimeMs(sha: string) {
      const ms = input.commitMs?.[sha];
      if (ms === undefined) throw new Error(`missing commit time for ${sha}`);
      return ms;
    },
    async deleteRef(branchName: string) {
      deletes.push(branchName);
      return { status: "deleted" };
    },
  };
}

describe("planUnusedBranches", () => {
  test("closed-head plans only the named ref", async () => {
    const plan = await planUnusedBranches({
      client: fakeClient({}),
      defaultBranch: DEFAULT_BRANCH,
      staleDays: DEFAULT_STALE_DAYS,
      nowMs,
      mode: { kind: "closed-head", head: "cursor/closed-e0a5" },
    });
    expect(plan).toEqual([
      { name: "cursor/closed-e0a5", decision: { action: "delete", reason: "closed-head" } },
    ]);
  });

  test("sweep keeps main, open work, and recent leftovers; deletes merged and stale", async () => {
    const plan = await planUnusedBranches({
      client: fakeClient({
        branches: [
          { name: "main", protected: true, commitSha: "aaa" },
          { name: "cursor/open-e0a5", protected: false, commitSha: "bbb" },
          { name: "cursor/merged-e0a5", protected: false, commitSha: "ccc" },
          { name: "cursor/fresh-e0a5", protected: false, commitSha: "ddd" },
          { name: "cursor/abandoned-e0a5", protected: false, commitSha: "eee" },
        ],
        pulls: [
          { number: 10, state: "open", merged: false, headRef: "cursor/open-e0a5" },
          { number: 11, state: "closed", merged: true, headRef: "cursor/merged-e0a5" },
        ],
        commitMs: {
          ddd: nowMs - 3 * MS_PER_DAY,
          eee: nowMs - DEFAULT_STALE_DAYS * MS_PER_DAY,
        },
      }),
      defaultBranch: DEFAULT_BRANCH,
      staleDays: DEFAULT_STALE_DAYS,
      nowMs,
      mode: { kind: "sweep" },
    });
    expect(plan.map((row) => `${row.decision.action}:${row.decision.reason}:${row.name}`)).toEqual([
      "keep:default-branch:main",
      "keep:open-pr:cursor/open-e0a5",
      "delete:merged-pr:cursor/merged-e0a5",
      "keep:recent-no-pr:cursor/fresh-e0a5",
      "delete:stale-no-pr:cursor/abandoned-e0a5",
    ]);
  });
});

describe("createGitHubClient", () => {
  test("lists pages, reads commit time, and treats 404 delete as already-gone", async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const href = String(url);
      const method = init?.method ?? "GET";
      calls.push({ url: href, method });
      if (href.endsWith("/branches?per_page=100")) {
        return new Response(JSON.stringify([{ name: "main", protected: true, commit: { sha: "aaa" } }]), {
          status: 200,
          headers: {
            link: '<https://api.github.com/repos/alexzhang1030/rclweb/branches?per_page=100&page=2>; rel="next"',
          },
        });
      }
      if (href.endsWith("/branches?per_page=100&page=2")) {
        return new Response(JSON.stringify([{ name: "cursor/foo-e0a5", protected: false, commit: { sha: "bbb" } }]), {
          status: 200,
        });
      }
      if (href.endsWith("/pulls?state=all&per_page=100")) {
        return new Response(
          JSON.stringify([
            {
              number: 12,
              state: "closed",
              merged_at: "2026-08-25T00:00:00Z",
              head: { ref: "cursor/foo-e0a5" },
            },
          ]),
          { status: 200 },
        );
      }
      if (href.endsWith("/commits/bbb")) {
        return new Response(
          JSON.stringify({ commit: { committer: { date: "2026-08-01T00:00:00.000Z" } } }),
          { status: 200 },
        );
      }
      if (href.endsWith("/git/refs/heads/cursor/foo-e0a5") && method === "DELETE") {
        return new Response(null, { status: 404 });
      }
      return new Response("unexpected", { status: 500 });
    };
    const client = createGitHubClient({
      repo: "alexzhang1030/rclweb",
      token: "test-token",
      fetchImpl,
    });
    expect(await client.listBranches()).toEqual([
      { name: "main", protected: true, commitSha: "aaa" },
      { name: "cursor/foo-e0a5", protected: false, commitSha: "bbb" },
    ]);
    expect(await client.listPulls()).toEqual([
      { number: 12, state: "closed", merged: true, headRef: "cursor/foo-e0a5" },
    ]);
    expect(await client.commitTimeMs("bbb")).toBe(Date.parse("2026-08-01T00:00:00.000Z"));
    expect(await client.deleteRef("cursor/foo-e0a5")).toEqual({ status: "already-gone" });
    expect(calls.some((call) => call.method === "DELETE")).toBe(true);
  });
});

describe("deleteUnusedBranchesMainForTest", () => {
  test("refuses to run without a token", async () => {
    const code = await deleteUnusedBranchesMainForTest(["--dry-run", "--repo", "alexzhang1030/rclweb"], {}, nowMs);
    expect(code).toBe(2);
  });
});

describe("delete-unused-branches workflow", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/delete-unused-branches.yml"), "utf8");
  const ci = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const checkoutPin = /actions\/checkout@[0-9a-f]{40}/.exec(ci)?.[0];
  const bunPin = /oven-sh\/setup-bun@[0-9a-f]{40}/.exec(ci)?.[0];

  test("closes same-repo heads, sweeps on a schedule, and keeps main", () => {
    expect(checkoutPin).toBeDefined();
    expect(bunPin).toBeDefined();
    expect(workflow).toContain("types: [closed]");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("bun-version-file: .bun-version");
    expect(workflow).toContain(checkoutPin!);
    expect(workflow).toContain(bunPin!);
    expect(workflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(workflow).toContain("--apply");
    expect(workflow).toContain("--closed-head");
    expect(workflow).toContain("scripts/delete-unused-branches.ts");
    expect(workflow).not.toContain("persist-credentials: true");
    expect(workflow).not.toMatch(/git push .*--delete/);
  });
});

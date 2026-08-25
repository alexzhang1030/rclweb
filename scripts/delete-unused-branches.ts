#!/usr/bin/env bun
/**
 * Delete leftover GitHub heads: closed-PR heads, merged leftovers, and
 * abandoned branches with no PR and a tip older than 14 days.
 *
 * --dry-run  list decisions (default)
 * --apply    delete the chosen refs
 * --closed-head NAME  PR-closed path: delete that head unless it is main
 */

export const DEFAULT_STALE_DAYS = 14;
export const DEFAULT_BRANCH = "main";
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DeleteUnusedMode = { kind: "sweep" } | { kind: "closed-head"; head: string };

export type DeleteUnusedCli = {
  apply: boolean;
  staleDays: number;
  defaultBranch: string;
  repo: string | undefined;
  mode: DeleteUnusedMode;
};

export type BranchSnapshot = {
  name: string;
  protected: boolean;
  lastCommitMs: number;
  pulls: readonly PullSnapshot[];
};

export type PullSnapshot = {
  number: number;
  state: "open" | "closed";
  merged: boolean;
};

export type KeepReason = "default-branch" | "protected" | "open-pr" | "recent-no-pr";
export type DeleteReason = "closed-head" | "merged-pr" | "stale-no-pr";

export type BranchDecision =
  | { action: "keep"; reason: KeepReason }
  | { action: "delete"; reason: DeleteReason };

export type GitHubClient = {
  listBranches(): Promise<readonly RemoteBranch[]>;
  listPulls(): Promise<readonly RemotePull[]>;
  commitTimeMs(sha: string): Promise<number>;
  deleteRef(branch: string): Promise<DeleteRefResult>;
};

export type RemoteBranch = {
  name: string;
  protected: boolean;
  commitSha: string;
};

export type RemotePull = {
  number: number;
  state: "open" | "closed";
  merged: boolean;
  headRef: string;
};

export type DeleteRefResult = { status: "deleted" } | { status: "already-gone" };

const USAGE =
  "usage: bun run scripts/delete-unused-branches.ts [--dry-run|--apply] [--closed-head NAME] [--stale-days N] [--default-branch NAME] [--repo owner/name]";

export function parseDeleteUnusedArgs(argv: string[]): DeleteUnusedCli | { error: string } {
  let apply: boolean | undefined;
  let closedHead: string | undefined;
  let staleDays = DEFAULT_STALE_DAYS;
  let defaultBranch = DEFAULT_BRANCH;
  let repo: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      if (apply === false) return { error: USAGE };
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      if (apply === true) return { error: USAGE };
      apply = false;
      continue;
    }
    if (arg === "--closed-head") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--") || closedHead !== undefined) return { error: USAGE };
      closedHead = value;
      i += 1;
      continue;
    }
    if (arg === "--stale-days") {
      const value = argv[i + 1];
      const parsed = Number(value);
      if (!value || !Number.isInteger(parsed) || parsed < 1) return { error: USAGE };
      staleDays = parsed;
      i += 1;
      continue;
    }
    if (arg === "--default-branch") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) return { error: USAGE };
      defaultBranch = value;
      i += 1;
      continue;
    }
    if (arg === "--repo") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) return { error: USAGE };
      repo = value;
      i += 1;
      continue;
    }
    return { error: USAGE };
  }
  return {
    apply: apply === true,
    staleDays,
    defaultBranch,
    repo,
    mode: closedHead === undefined ? { kind: "sweep" } : { kind: "closed-head", head: closedHead },
  };
}

export function resolveRepo(
  cliRepo: string | undefined,
  envRepo: string | undefined,
): string | { error: string } {
  const repo = cliRepo ?? envRepo;
  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return { error: "delete-unused-branches: set --repo owner/name or GITHUB_REPOSITORY" };
  }
  return repo;
}

export function decideBranch(input: {
  branch: BranchSnapshot;
  defaultBranch: string;
  staleDays: number;
  nowMs: number;
  mode: DeleteUnusedMode;
}): BranchDecision {
  if (input.branch.name === input.defaultBranch) {
    return { action: "keep", reason: "default-branch" };
  }
  if (input.branch.protected) {
    return { action: "keep", reason: "protected" };
  }
  if (input.mode.kind === "closed-head") {
    if (input.branch.name !== input.mode.head) {
      return { action: "keep", reason: "recent-no-pr" };
    }
    return { action: "delete", reason: "closed-head" };
  }
  if (input.branch.pulls.some((pull) => pull.state === "open")) {
    return { action: "keep", reason: "open-pr" };
  }
  if (input.branch.pulls.some((pull) => pull.merged)) {
    return { action: "delete", reason: "merged-pr" };
  }
  const ageMs = input.nowMs - input.branch.lastCommitMs;
  if (input.branch.pulls.length === 0 && ageMs >= input.staleDays * MS_PER_DAY) {
    return { action: "delete", reason: "stale-no-pr" };
  }
  return { action: "keep", reason: "recent-no-pr" };
}

export function formatDecision(name: string, decision: BranchDecision): string {
  switch (decision.action) {
    case "keep":
      switch (decision.reason) {
        case "default-branch":
          return `keep ${name} (default-branch)`;
        case "protected":
          return `keep ${name} (protected)`;
        case "open-pr":
          return `keep ${name} (open-pr)`;
        case "recent-no-pr":
          return `keep ${name} (recent-no-pr)`;
        default: {
          const _exhaustive: never = decision.reason;
          return _exhaustive;
        }
      }
    case "delete":
      switch (decision.reason) {
        case "closed-head":
          return `delete ${name} (closed-head)`;
        case "merged-pr":
          return `delete ${name} (merged-pr)`;
        case "stale-no-pr":
          return `delete ${name} (stale-no-pr)`;
        default: {
          const _exhaustive: never = decision.reason;
          return _exhaustive;
        }
      }
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}

export function groupPullsByHead(pulls: readonly RemotePull[]): Map<string, PullSnapshot[]> {
  const grouped = new Map<string, PullSnapshot[]>();
  for (const pull of pulls) {
    const list = grouped.get(pull.headRef) ?? [];
    list.push({ number: pull.number, state: pull.state, merged: pull.merged });
    grouped.set(pull.headRef, list);
  }
  return grouped;
}

export async function planUnusedBranches(input: {
  client: GitHubClient;
  defaultBranch: string;
  staleDays: number;
  nowMs: number;
  mode: DeleteUnusedMode;
}): Promise<readonly { name: string; decision: BranchDecision }[]> {
  if (input.mode.kind === "closed-head") {
    return [
      {
        name: input.mode.head,
        decision: decideBranch({
          branch: {
            name: input.mode.head,
            protected: false,
            lastCommitMs: input.nowMs,
            pulls: [],
          },
          defaultBranch: input.defaultBranch,
          staleDays: input.staleDays,
          nowMs: input.nowMs,
          mode: input.mode,
        }),
      },
    ];
  }

  const [branches, pulls] = await Promise.all([input.client.listBranches(), input.client.listPulls()]);
  const byHead = groupPullsByHead(pulls);
  const plan: { name: string; decision: BranchDecision }[] = [];
  for (const branch of branches) {
    const branchPulls = byHead.get(branch.name) ?? [];
    const open = branchPulls.some((pull) => pull.state === "open");
    const merged = branchPulls.some((pull) => pull.merged);
    const needsAge =
      branch.name !== input.defaultBranch && !branch.protected && !open && !merged && branchPulls.length === 0;
    const lastCommitMs = needsAge ? await input.client.commitTimeMs(branch.commitSha) : input.nowMs;
    plan.push({
      name: branch.name,
      decision: decideBranch({
        branch: {
          name: branch.name,
          protected: branch.protected,
          lastCommitMs,
          pulls: branchPulls,
        },
        defaultBranch: input.defaultBranch,
        staleDays: input.staleDays,
        nowMs: input.nowMs,
        mode: input.mode,
      }),
    });
  }
  return plan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const found = value[key];
  return typeof found === "string" ? found : undefined;
}

function parseBranch(value: unknown): RemoteBranch | undefined {
  if (!isRecord(value)) return undefined;
  const name = readString(value, "name");
  const protectedFlag = value.protected;
  const commit = value.commit;
  if (!name || typeof protectedFlag !== "boolean" || !isRecord(commit)) return undefined;
  const commitSha = readString(commit, "sha");
  if (!commitSha) return undefined;
  return { name, protected: protectedFlag, commitSha };
}

function parsePull(value: unknown): RemotePull | undefined {
  if (!isRecord(value)) return undefined;
  const number = value.number;
  const state = value.state;
  const head = value.head;
  if (typeof number !== "number" || (state !== "open" && state !== "closed") || !isRecord(head)) {
    return undefined;
  }
  const headRef = readString(head, "ref");
  if (!headRef) return undefined;
  return {
    number,
    state,
    merged: value.merged_at !== null && value.merged_at !== undefined,
    headRef,
  };
}

function parseCommitTimeMs(value: unknown): number | undefined {
  if (!isRecord(value) || !isRecord(value.commit) || !isRecord(value.commit.committer)) return undefined;
  const date = readString(value.commit.committer, "date");
  if (!date) return undefined;
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? ms : undefined;
}

function parseNextLink(link: string | null): string | undefined {
  if (!link) return undefined;
  return /<([^>]+)>;\s*rel="next"/.exec(link)?.[1];
}

export function githubRefPath(branch: string): string {
  return `heads/${branch.split("/").map(encodeURIComponent).join("/")}`;
}

export function createGitHubClient(input: { repo: string; token: string; fetchImpl?: typeof fetch }): GitHubClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = `https://api.github.com/repos/${input.repo}`;

  async function request(url: string, method = "GET"): Promise<{ status: number; body: unknown; link: string | null }> {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "rclweb-delete-unused-branches",
      },
    });
    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body, link: response.headers.get("link") };
  }

  async function collect<T>(firstUrl: string, parse: (value: unknown) => T | undefined): Promise<T[]> {
    const out: T[] = [];
    let url: string | undefined = firstUrl;
    while (url) {
      const page = await request(url);
      if (page.status < 200 || page.status >= 300 || !Array.isArray(page.body)) {
        throw new Error(`delete-unused-branches: GitHub ${url} returned ${page.status}`);
      }
      for (const item of page.body) {
        const parsed = parse(item);
        if (!parsed) throw new Error(`delete-unused-branches: unexpected GitHub payload from ${url}`);
        out.push(parsed);
      }
      url = parseNextLink(page.link);
    }
    return out;
  }

  return {
    listBranches() {
      return collect(`${base}/branches?per_page=100`, parseBranch);
    },
    listPulls() {
      return collect(`${base}/pulls?state=all&per_page=100`, parsePull);
    },
    async commitTimeMs(sha: string) {
      const page = await request(`${base}/commits/${encodeURIComponent(sha)}`);
      const ms = parseCommitTimeMs(page.body);
      if (page.status < 200 || page.status >= 300 || ms === undefined) {
        throw new Error(`delete-unused-branches: GitHub commit ${sha} returned ${page.status}`);
      }
      return ms;
    },
    async deleteRef(branch: string) {
      const page = await request(`${base}/git/refs/${githubRefPath(branch)}`, "DELETE");
      if (page.status === 204) return { status: "deleted" };
      if (page.status === 404) return { status: "already-gone" };
      throw new Error(`delete-unused-branches: delete ${branch} returned ${page.status}`);
    },
  };
}

async function main(argv: string[], env: NodeJS.ProcessEnv, nowMs: number): Promise<number> {
  const parsed = parseDeleteUnusedArgs(argv);
  if ("error" in parsed) {
    console.error(parsed.error);
    return 2;
  }
  const repo = resolveRepo(parsed.repo, env.GITHUB_REPOSITORY);
  if (typeof repo !== "string") {
    console.error(repo.error);
    return 2;
  }
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (!token) {
    console.error("delete-unused-branches: set GITHUB_TOKEN or GH_TOKEN");
    return 2;
  }
  const client = createGitHubClient({ repo, token });
  const plan = await planUnusedBranches({
    client,
    defaultBranch: parsed.defaultBranch,
    staleDays: parsed.staleDays,
    nowMs,
    mode: parsed.mode,
  });
  let kept = 0;
  let deleted = 0;
  for (const row of plan) {
    console.log(formatDecision(row.name, row.decision));
    switch (row.decision.action) {
      case "keep":
        kept += 1;
        break;
      case "delete":
        if (parsed.apply) {
          const result = await client.deleteRef(row.name);
          switch (result.status) {
            case "deleted":
            case "already-gone":
              deleted += 1;
              break;
            default: {
              const _exhaustive: never = result;
              return _exhaustive;
            }
          }
        } else {
          deleted += 1;
        }
        break;
      default: {
        const _exhaustive: never = row.decision;
        return _exhaustive;
      }
    }
  }
  const mode = parsed.apply ? "apply" : "dry-run";
  console.log(`delete-unused-branches: status=ok mode=${mode} kept=${kept} deleted=${deleted}`);
  return 0;
}

if (import.meta.main) {
  main(process.argv.slice(2), process.env, Date.now())
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(`delete-unused-branches: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}

export const deleteUnusedBranchesMainForTest = main;

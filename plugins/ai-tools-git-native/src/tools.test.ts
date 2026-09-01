import type { GitCapability } from "@termco/git-base";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGitTools } from "./tools";

const git = {
  resolveRepo: vi.fn(async () => ({
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    isDetached: false,
  })),
  status: vi.fn(async () => ({ changedFiles: [] })),
  diff: vi.fn(async () => ({ diffText: "", truncated: false })),
  stage: vi.fn(async () => undefined),
  discard: vi.fn(async () => undefined),
} as unknown as GitCapability;
const context = {
  getCwd: () => "/repo/src",
  getWorkspaceRoot: () => "/repo",
  getWorkspaceEnv: () => ({ kind: "local" as const }),
};

beforeEach(() => vi.clearAllMocks());

describe("source-owned Git AI tools", () => {
  it("keeps reads automatic and every mutation approval-gated", () => {
    const tools = buildGitTools(git, context);
    for (const name of ["git_status", "git_diff", "git_log", "git_list_branches", "git_show_commit"]) {
      expect(tools[name].needsApproval).toBeUndefined();
    }
    for (const name of ["git_stage", "git_unstage", "git_discard", "git_commit", "git_checkout_branch", "git_fetch", "git_pull", "git_push"]) {
      expect(tools[name].needsApproval).toBe(true);
    }
  });

  it("resolves the repository through the shared provider and forwards diff arguments", async () => {
    await buildGitTools(git, context).git_diff.execute({ path: "a.ts", staged: true });
    expect(git.resolveRepo).toHaveBeenCalledWith("/repo/src", { kind: "local" });
    expect(git.diff).toHaveBeenCalledWith("/repo", "a.ts", true, { kind: "local" });
  });

  it("marks untracked paths before destructive discard", async () => {
    vi.mocked(git.status).mockResolvedValue({
      changedFiles: [
        { path: "new.ts", untracked: true },
        { path: "old.ts", untracked: false },
      ],
    } as never);
    await buildGitTools(git, context).git_discard.execute({ paths: ["new.ts", "old.ts"] });
    expect(git.discard).toHaveBeenCalledWith(
      "/repo",
      [
        { path: "new.ts", untracked: true },
        { path: "old.ts", untracked: false },
      ],
      { kind: "local" },
    );
  });

  it("reports a useful error outside a repository", async () => {
    vi.mocked(git.resolveRepo).mockResolvedValue(null);
    await expect(buildGitTools(git, context).git_status.execute({})).resolves
      .toEqual(expect.objectContaining({ error: expect.stringContaining("not a git repository") }));
  });
});

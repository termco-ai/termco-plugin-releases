import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { GitCapability } from "@termco/git-base";
import type { PluginModule } from "@termco/kernel";
import type { WorkspaceCapability, WorkspaceExecutionCapability } from "@termco/workspace-base";
import * as operations from "./operations";
import { resolveRepo } from "./resolve";
import { configureGitRuntime } from "./runtime";
import { gitStatus } from "./status";
import { WORKSPACE_FILES_SERVICE } from "@termco/files-base";
import { WORKSPACE_EXECUTION_SERVICE, WORKSPACE_REGISTRY_SERVICE } from "@termco/workspace-base";

const plugin: PluginModule = {
  inject: [
    WORKSPACE_REGISTRY_SERVICE,
    WORKSPACE_EXECUTION_SERVICE,
    WORKSPACE_FILES_SERVICE,
  ],
  async activate(context) {
    await context.effect(() =>
      configureGitRuntime({
        workspace: context.get<WorkspaceCapability>("workspace.registry"),
        execution: context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE),
        files: context.get<WorkspaceFilesCapability>("workspace.files"),
      }),
    );
    const capability: GitCapability = {
      resolveRepo,
      async panelSnapshot(cwd, workspace) {
        const repo = await resolveRepo(cwd, workspace);
        if (!repo) return { repo: null, status: null };
        return { repo, status: await gitStatus(repo.repoRoot, workspace).catch(() => null) };
      },
      status: gitStatus,
      diff: operations.diff,
      diffContent: operations.diffContent,
      stage: operations.stage,
      unstage: operations.unstage,
      discard: operations.discard,
      commit: operations.commit,
      commitFiles: operations.commitFiles,
      commitFileDiff: operations.commitFileDiff,
      fetch: operations.fetch,
      pullFfOnly: operations.pullFfOnly,
      push: operations.push,
      log: operations.log,
      showCommit: operations.showCommitDiff,
      listBranches: operations.listBranches,
      checkoutBranch: operations.checkoutBranch,
      remoteUrl: operations.remoteUrl,
    };
    context.provide("git.repository", capability);
  },
};

export default plugin;

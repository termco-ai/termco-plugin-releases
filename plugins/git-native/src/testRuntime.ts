import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { WorkspaceCapability, WorkspaceExecutionCapability } from "@termco/workspace-base";
import { configureGitRuntime } from "./runtime";

configureGitRuntime({
  workspace: {
    authorize: (path: string) => path,
  } as unknown as WorkspaceCapability,
  execution: {
    availability: () => ({ available: true, backendId: "test", label: "Test" }),
    invoke: async () => {
      throw new Error("remote Git is not configured in this test");
    },
  } as unknown as WorkspaceExecutionCapability,
  files: {
    readFile: async () => ({ kind: "missing" }),
  } as unknown as WorkspaceFilesCapability,
});

import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

let files: WorkspaceFilesCapability | null = null;
let workspace: WorkspaceEnv = { kind: "local" };

export function fileRuntimeActive(): boolean {
  return files !== null;
}

export function configureFiles(capability: WorkspaceFilesCapability): () => void {
  files = capability;
  return () => {
    if (files === capability) files = null;
  };
}

export function setActiveWorkspace(value: WorkspaceEnv): void {
  workspace = value;
}

export const native = {
  async readFile(path: string, options?: { optional?: boolean }) {
    if (!files) throw new Error("workspace.files is unavailable");
    return files.readFile(path, workspace, options?.optional) as Promise<
      | { kind: "text"; content: string }
      | { kind: "binary" | "missing"; content?: undefined }
    >;
  },
};

import type { WorkspaceFilesCapability } from "@termco/files-base";
import type {
  WorkspaceEnv,
  WorkspaceRigsCapability,
} from "@termco/workspace-base";
import type { ReadResult } from "./types";

let files: WorkspaceFilesCapability | null = null;
let rigs: WorkspaceRigsCapability | null = null;

export function aiNativeFilesActive(): boolean {
  return files !== null || rigs !== null;
}

export function configureNativeFiles(
  fileCapability: WorkspaceFilesCapability,
  rigCapability: WorkspaceRigsCapability,
): () => void {
  files = fileCapability;
  rigs = rigCapability;
  return () => {
    if (files === fileCapability) files = null;
    if (rigs === rigCapability) rigs = null;
  };
}

function selectedFiles(): WorkspaceFilesCapability {
  if (!files) throw new Error("workspace.files is unavailable");
  return files;
}

export function currentWorkspace(): WorkspaceEnv {
  const snapshot = rigs?.snapshot();
  return (
    snapshot?.rigs.find((rig) => rig.id === snapshot.activeId)?.workspace ?? {
      kind: "local",
    }
  );
}

export async function listWorkspaceFiles(root: string): Promise<{
  files: string[];
  truncated: boolean;
}> {
  const result = await selectedFiles().listFiles({ root }, currentWorkspace());
  if (!result || typeof result !== "object") return { files: [], truncated: false };
  const value = result as { files?: unknown; truncated?: unknown };
  return {
    files: Array.isArray(value.files)
      ? value.files.filter((entry): entry is string => typeof entry === "string")
      : [],
    truncated: value.truncated === true,
  };
}

export const native = {
  canonicalize(path: string): Promise<string> {
    return selectedFiles().canonicalize(path, currentWorkspace());
  },
  createDir(path: string): Promise<void> {
    return selectedFiles().createDir(path, currentWorkspace());
  },
  writeFile(path: string, content: string): Promise<void> {
    return selectedFiles().writeFile(
      path,
      content,
      currentWorkspace(),
      "ai-chat-native",
    );
  },
  readFile(path: string, options?: { optional?: boolean }): Promise<ReadResult> {
    return selectedFiles().readFile(
      path,
      currentWorkspace(),
      options?.optional,
    ) as Promise<ReadResult>;
  },
};

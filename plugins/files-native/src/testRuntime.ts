import type { WorkspaceCapability } from "@termco/workspace-base";
import { configureWorkspace } from "./runtime";

configureWorkspace({
  resolvePath: (path: string) => path,
  toCanonicalDisplay: (path: string) => path.replace(/\\/g, "/"),
  authorizeRoot: (path: string) => path,
} as unknown as WorkspaceCapability);

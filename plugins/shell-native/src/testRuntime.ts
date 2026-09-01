import type { WorkspaceCapability } from "@termco/workspace-base";
import { configureWorkspace } from "./runtime";

configureWorkspace({ authorizeRoot: (path: string) => path } as unknown as WorkspaceCapability);

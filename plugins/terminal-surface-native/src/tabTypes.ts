import type { PaneNode } from "./terminal/lib/panes";
import type { WorkspaceEnv } from "./runtime";

export type TerminalTab = {
  id: number;
  rigId: string;
  workspace: WorkspaceEnv;
  kind: "terminal";
  title: string;
  cold?: boolean;
  cwd?: string;
  paneTree: PaneNode;
  activeLeafId: number;
  blocks?: boolean;
  private?: boolean;
  customTitle?: string;
};

export type Tab = TerminalTab | {
  id: number;
  rigId: string;
  kind: string;
  title: string;
  cold?: boolean;
};

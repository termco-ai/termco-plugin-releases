import type { WorkspaceEnv } from "@termco/workspace-base";

/** Public intents emitted by rich terminal command blocks. Surface plugins
 * subscribe through `events.application`, keeping each implementation
 * independently copyable and replaceable. */
export const TERMINAL_BLOCK_EVENTS = {
  openFile: "terminal.block:open-file",
  openFolder: "terminal.block:open-folder",
  openDiff: "terminal.block:open-diff",
  openPreview: "terminal.block:open-preview",
} as const;

export type TerminalBlockOpenFile = {
  path: string;
  line?: number;
  column?: number;
  env?: WorkspaceEnv;
};

export type TerminalBlockOpenFolder = {
  path: string;
  env?: WorkspaceEnv;
};

export type TerminalBlockOpenDiff = { path: string; repoRoot: string };
export type TerminalBlockOpenPreview = { url: string };

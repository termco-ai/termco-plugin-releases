import {
  TERMINAL_BLOCK_EVENTS,
  type TerminalBlockOpenDiff,
  type TerminalBlockOpenFile,
  type TerminalBlockOpenFolder,
  type TerminalBlockOpenPreview,
} from "@termco/terminal-base";
import { type WorkspaceEnv } from "@termco/workspace-base";
import { terminalRuntime } from "../../../runtime";

export const BLOCK_FIND_EVENT = "termco:block-find";
export const BLOCK_OPEN_FILE_EVENT = TERMINAL_BLOCK_EVENTS.openFile;
export const BLOCK_OPEN_FOLDER_EVENT = TERMINAL_BLOCK_EVENTS.openFolder;
export const BLOCK_OPEN_DIFF_EVENT = TERMINAL_BLOCK_EVENTS.openDiff;
export const BLOCK_OPEN_PREVIEW_EVENT = TERMINAL_BLOCK_EVENTS.openPreview;

export type BlockFindDetail = { leafId: number; blockId: string };
/** `line`/`column` are 1-based; omit them to just open the file. Chat cards
 * (findings, tables, trees) use them to land on the exact spot. */
export type BlockOpenFileDetail = TerminalBlockOpenFile;

export function findInBlock(leafId: number, blockId: string): void {
  window.dispatchEvent(
    new CustomEvent<BlockFindDetail>(BLOCK_FIND_EVENT, {
      detail: { leafId, blockId },
    }),
  );
}
export type BlockOpenFolderDetail = TerminalBlockOpenFolder;
export type BlockOpenDiffDetail = TerminalBlockOpenDiff;
export type BlockOpenPreviewDetail = TerminalBlockOpenPreview;

export function openFileFromBlock(
  path: string,
  line?: number,
  column?: number,
): void {
  terminalRuntime().events.emit(BLOCK_OPEN_FILE_EVENT, { path, line, column });
}

export function openFolderFromBlock(path: string, env?: WorkspaceEnv): void {
  terminalRuntime().events.emit(BLOCK_OPEN_FOLDER_EVENT, { path, env });
}

export function openDiffFromBlock(path: string, repoRoot: string): void {
  terminalRuntime().events.emit(BLOCK_OPEN_DIFF_EVENT, { path, repoRoot });
}

export function openPreviewFromBlock(url: string): void {
  terminalRuntime().events.emit(BLOCK_OPEN_PREVIEW_EVENT, { url });
}

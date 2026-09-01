export interface TerminalPaneSessionHandle {
  write(data: string): void;
  focus(): void;
  getBuffer(maxLines?: number): string | null;
  getSelection(): string | null;
}

export interface OpenTerminalTabInput {
  cwd?: string;
  title?: string;
  rigId?: string;
  blocks?: boolean;
  private?: boolean;
}

export interface OpenTerminalTabResult {
  tabId: number;
  leafId: number;
}

/** Renderer-owned terminal surfaces shared with AI/session consumers. Native
 * process ownership remains in the selected `terminal.pty` provider. */
export interface TerminalSessionsCapability {
  open(input?: OpenTerminalTabInput): OpenTerminalTabResult;
  /** Replace the complete workspace with one terminal and dispose every
   * terminal pane owned by the previous workspace. */
  reset(input?: OpenTerminalTabInput): OpenTerminalTabResult;
  register(leafId: number, handle: TerminalPaneSessionHandle | null): void;
  handle(leafId: number): TerminalPaneSessionHandle | null;
  leafIds(): readonly number[];
  /** Resolve a provider-owned PTY session id to its public workspace leaf id.
   * Agent activity consumers must not import terminal session internals. */
  leafForPty(ptyId: number): number | null;
  write(leafId: number, data: string): boolean;
  focus(leafId: number): boolean;
  buffer(leafId: number, maxLines?: number): string | null;
  selection(leafId: number): string | null;
  whenReady(leafId: number): Promise<void>;
  /** True when any live terminal session owns a foreground process. */
  hasForegroundProcesses(): Promise<boolean>;
  /** Clear the terminal pane that currently owns terminal focus. */
  clearFocused(): boolean;
  /** Move block-mode focus inside the currently focused terminal pane. */
  navigateFocusedBlocks(direction: -1 | 1): boolean;
  dispose(leafId: number): void;
}

import type { TerminalSearchHandle } from "../search/types";
import type { WorkspaceEnv } from "../../../runtime";
import type React from "react";
import type { BlockDecorations } from "../../block/lib/blockDecorations";
import type { BlockMode } from "../../block/lib/modeMachine";
import type { DormantRing } from "../dormantRing";
import type { TerminalLineSpace } from "../lineSpace";
import type { PtySession } from "../pty-bridge";
import type { PtyStreamParser } from "../streamParser";

export type Callbacks = {
  onSearchReady?: (addon: TerminalSearchHandle) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
};

export type Session = {
  pty: PtySession | null;
  ptyOpening: boolean;
  /**
   * The workspace env this terminal is bound to (the env of the rig it was
   * created in — local vs a specific ssh host). Captured at creation and used
   * by the terminal's own block widgets so they read fs/git against the RIGHT
   * backend, instead of the global `currentWorkspaceEnv()` (the active rig's
   * env, which is wrong for a block belonging to a non-active rig).
   */
  env: WorkspaceEnv;
  initialCwd: string | undefined;
  lastCwd: string | null;
  pendingExit: number | null;
  shellExited: boolean;
  callbacks: Callbacks;
  visibleNow: boolean;
  focusedNow: boolean;
  disposed: boolean;
  ready: Promise<void>;
  cols: number;
  rows: number;
  container: HTMLDivElement | null;
  snapshot: string | null;
  dormantRing: DormantRing;
  pendingInput: string;
  hasSlot: boolean;
  blocks: boolean;
  blockMode: BlockMode;
  blockListeners: Set<() => void>;
  blockDecorations: BlockDecorations | null;
  // Set by the block shell-input; called to pull focus back when the xterm
  // grid steals it at the prompt (e.g. on a click), so typing stays in the bar.
  inputFocus: (() => void) | null;
  // Per-leaf unsent shell-input text; the single workspace bar swaps it on focus change.
  inputDraft: string;
  // Live "input has text" flag from the block shell-input (gates the watermark).
  inputActive: boolean;
  // A command was submitted on this leaf; kills the watermark synchronously,
  // before the shell's OSC 133 C round-trips through the PTY.
  everSubmitted: boolean;
  // True if the slot was in alt-screen mode (TUI like vim, htop, dofek)
  // at the most recent release. Read once on the next bind to trigger a
  // SIGWINCH-driven repaint instead of replaying dormant bytes.
  altScreenAtRelease: boolean;
  // OSC 133 C..D window (or blocks running mode): a foreground process owns
  // the terminal, so the leaf must keep its live grid while hidden.
  commandRunning: boolean;
  hiddenReleaseTimer: ReturnType<typeof setTimeout> | null;
  spawnFailed: boolean;
  // Session-scoped byte-stream parsing: OSC extraction, DEC mode
  // tracking and query answering happen before bytes reach the engine,
  // and keep working while the leaf is dormant or slot-recycled.
  parser: PtyStreamParser;
  lineSpace: TerminalLineSpace;
  searchHandle: TerminalSearchHandle;
  oscDisposers: (() => void)[];
  // Absolute line of the stored snapshot's first line (anchor rebasing).
  snapshotBase: number | null;
};

export type Options = {
  leafId: number;
  workspace: WorkspaceEnv;
  container: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  focused?: boolean;
  initialCwd?: string;
  blocks?: boolean;
  onSearchReady?: (addon: TerminalSearchHandle) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
};

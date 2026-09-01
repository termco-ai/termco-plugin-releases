import type { DecPrivateModes } from "../streamParser";
import type { TerminalEngine } from "../engine";

export type SlotAdapter = {
  resolveLeaf(leafId: number): LeafBridge | null;
  evictLeaf(leafId: number): void;
  isLeafFocused(leafId: number): boolean;
  isLeafBlocks(leafId: number): boolean;
  isLeafBusy(leafId: number): boolean;
  isLeafVisible(leafId: number): boolean;
  storeSnapshot(leafId: number, out: SerializeOutput): void;
};

export type LeafBridge = {
  writeToPty(data: string): void;
  resizePty(cols: number, rows: number): void;
  // Force a SIGWINCH on the underlying PTY at the given dims. Implemented
  // as a +1 row / restore bump because the Linux kernel suppresses winsize
  // ioctls that don't actually change the size. Used to make alt-screen
  // TUIs repaint from scratch after they were dormant.
  kickPty(cols: number, rows: number): void;
  // DEC private mode state from the leaf's stream parser; drives mouse
  // reporting (null while no parser is attached).
  getDecModes(): DecPrivateModes | null;
};

export type Slot = {
  readonly id: number;
  readonly engine: TerminalEngine;
  readonly host: HTMLDivElement;
  currentLeafId: number | null;
  // Leaf whose buffer this slot still holds intact after release; serialized
  // only if another leaf steals the slot.
  retainedLeafId: number | null;
  parked: boolean;
  // Input interceptor + other per-slot listeners, run on dispose.
  disposers: (() => void)[];
  observer: ResizeObserver | null;
  fitTimer: ReturnType<typeof setTimeout> | null;
  ptyTimer: ReturnType<typeof setTimeout> | null;
  slotReapTimer: ReturnType<typeof setTimeout> | null;
  unhideRaf: number | null;
  lastCols: number;
  lastRows: number;
  lastW: number;
  lastH: number;
  lastUsedAt: number;
};

export type PoolSlotStat = {
  id: number;
  leafId: number | null;
  retainedLeafId: number | null;
  parked: boolean;
  cols: number;
  rows: number;
  bufferLines: number;
};

export type AcquireParams = {
  leafId: number;
  container: HTMLDivElement;
  snapshot: string | null;
  // True if the slot was in alt-screen mode (TUI like vim, htop, dofek)
  // at the time it was released. When set, bindSlot skips ring replay
  // and kicks SIGWINCH so the TUI repaints from scratch.
  altScreen: boolean;
  // Drains the dormant byte ring. The session routes the bytes through
  // its stream parser internally; `write` receives passthrough spans.
  drainRing: (write: (bytes: Uint8Array) => void) => void;
  shellExited: boolean;
  cols: number;
  rows: number;
};

export type SerializeOutput = {
  snapshot: string | null;
  /** Buffer lines in the snapshot (anchor rebasing on restore). */
  lines: number;
  cols: number;
  rows: number;
  altScreen: boolean;
};

export type ReleaseOutput = { cols: number; rows: number };

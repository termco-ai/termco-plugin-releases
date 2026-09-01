import type { Anchor } from "../../../lib/lineSpace";
import type { BlockMode } from "../modeMachine";

export type Entry = {
  id: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number;
  startMarker: Anchor;
  endMarker: Anchor;
};

export type LiveBlock = {
  id: string;
  command: string;
  cwd: string;
  startedAt: number;
  startMarker: Anchor;
  usedAlt: boolean;
  /** The command erased the scrollback (CSI 3 J) — leave no card behind. */
  wiped?: boolean;
};

export type BlockContext = {
  command: string;
  cwd: string;
  exitCode: number | null;
  output: string;
};

export type PositionedBlock = {
  id: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  running: boolean;
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  top: number;
  bottom: number;
  // Pixel top of the header row (one line above the command, in the blank gap).
  headerTop: number;
};

export type VisibleBlocks = {
  blocks: PositionedBlock[];
  sticky: PositionedBlock | null;
};

export type BlockMatch = {
  line: number;
  col: number;
  len: number;
  /**
   * Where the match lives: the command echo (highlighted in the header's
   * synthesized echo line) or the output buffer. Defaults to "output".
   */
  kind?: "command" | "output";
  /**
   * Index of this match among the block's output matches, in reading
   * order. Maps a match in rows hidden behind a widget to the same-rank
   * occurrence in the widget's visible text.
   */
  ordinal?: number;
};

export type BlockDecorationsOptions = {
  onCwd?: (cwd: string) => void;
  onMode?: (mode: BlockMode) => void;
  onViewport?: () => void;
};

/** Ruler mark for a finished block, as a fraction of the buffer height. */
export type RulerMark = { frac: number; ok: boolean };

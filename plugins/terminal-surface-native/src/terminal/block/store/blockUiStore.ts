/**
 * Per-block UI state (collapsed / dismissed / measured widget geometry),
 * outside React so the wterm blocks provider can read it synchronously on
 * every render frame. Content data (command, exit code, output) stays in
 * BlockDecorations; this store only holds presentation choices.
 */

type BlockBodyKind =
  | "rows" // plain output: the block's real grid rows
  | "widget"; // a replace-mode widget stands in for the rows

export type BlockUiState = {
  collapsed?: boolean;
  dismissed?: boolean;
  /** Which body presentation the block resolved to (React decides once). */
  bodyKind?: BlockBodyKind;
  /** Measured height of the app body slot (widget / pills), px. */
  bodyPx?: number;
};

type LeafListener = () => void;

const states = new Map<number, Map<string, BlockUiState>>();
const listeners = new Map<number, Set<LeafListener>>();
/** Fires for every change on any leaf — used to poke the engine renderer. */
const globalListeners = new Set<(leafId: number) => void>();

const EMPTY_UI: BlockUiState = Object.freeze({});

export function getBlockUi(leafId: number, blockId: string): BlockUiState {
  // Stable object identities: useSyncExternalStore compares snapshots by
  // reference, so unset blocks must share one frozen empty state.
  return states.get(leafId)?.get(blockId) ?? EMPTY_UI;
}

export function setBlockUi(
  leafId: number,
  blockId: string,
  patch: Partial<BlockUiState>,
): void {
  let leaf = states.get(leafId);
  if (!leaf) {
    leaf = new Map();
    states.set(leafId, leaf);
  }
  const prev = leaf.get(blockId) ?? {};
  const next = { ...prev, ...patch };
  if (
    prev.collapsed === next.collapsed &&
    prev.dismissed === next.dismissed &&
    prev.bodyKind === next.bodyKind &&
    prev.bodyPx === next.bodyPx
  ) {
    return;
  }
  leaf.set(blockId, next);
  emit(leafId);
}

export function clearLeafBlockUi(leafId: number): void {
  if (!states.delete(leafId)) return;
  emit(leafId);
}

export function subscribeLeafBlockUi(
  leafId: number,
  fn: LeafListener,
): () => void {
  let set = listeners.get(leafId);
  if (!set) {
    set = new Set();
    listeners.set(leafId, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    if (set?.size === 0) listeners.delete(leafId);
  };
}

/** Engine-side hook: relayout the leaf's renderer when block UI changes. */
export function onAnyBlockUiChange(fn: (leafId: number) => void): () => void {
  globalListeners.add(fn);
  return () => globalListeners.delete(fn);
}

function emit(leafId: number): void {
  const set = listeners.get(leafId);
  if (set) for (const fn of set) fn();
  for (const fn of globalListeners) fn(leafId);
}

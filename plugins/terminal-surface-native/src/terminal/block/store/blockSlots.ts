/**
 * Registry of live block container slots, published by the wterm blocks
 * renderer via onBlockMount/onBlockUnmount. BlockPaneLayout portals the
 * React header/body content into these elements. Slots exist only while
 * the block is materialized in the visible window.
 */
import type { BlockSlots } from "@wterm/dom";

export type MountedBlock = {
  blockId: string;
  slots: BlockSlots;
};

const mounted = new Map<number, Map<string, MountedBlock>>();
const listeners = new Map<number, Set<() => void>>();
/** Stable-per-frame snapshots so useSyncExternalStore doesn't loop. */
const snapshots = new Map<number, MountedBlock[]>();

export function mountBlockSlot(
  leafId: number,
  blockId: string,
  slots: BlockSlots,
): void {
  let leaf = mounted.get(leafId);
  if (!leaf) {
    leaf = new Map();
    mounted.set(leafId, leaf);
  }
  leaf.set(blockId, { blockId, slots });
  snapshots.delete(leafId);
  emit(leafId);
}

export function unmountBlockSlot(leafId: number, blockId: string): void {
  const leaf = mounted.get(leafId);
  if (!leaf?.delete(blockId)) return;
  if (leaf.size === 0) mounted.delete(leafId);
  snapshots.delete(leafId);
  emit(leafId);
}

export function getMountedBlocks(leafId: number): MountedBlock[] {
  let snap = snapshots.get(leafId);
  if (!snap) {
    snap = [...(mounted.get(leafId)?.values() ?? [])];
    snapshots.set(leafId, snap);
  }
  return snap;
}

export function subscribeMountedBlocks(
  leafId: number,
  fn: () => void,
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

function emit(leafId: number): void {
  const set = listeners.get(leafId);
  if (set) for (const fn of set) fn();
}

/**
 * Meta for one finished block — immutable once read, so the first successful
 * read is kept for the component's lifetime.
 *
 * The first read can legitimately come up empty: on a rig switch the slot
 * pool retains the leaf's engine (parked, buffer intact) and the block
 * containers stay registered in the blockSlots store, so the header/body
 * portals re-render BEFORE the session re-attaches its BlockDecorations to
 * the slot's engine — and `readBlockMeta` needs that engine for ranges.
 * Freezing that null (the old `useMemo` behavior) left every card empty
 * until the next command rebuilt the containers. Instead, retry on the
 * block-viewport signal (`attach()` schedules one) until meta resolves,
 * then stop listening.
 */
import { useEffect, useState } from "react";
import type { useTerminalSession } from "../../../lib/useTerminalSession";

type BlockSession = Pick<
  ReturnType<typeof useTerminalSession>,
  "readBlockMeta" | "subscribeBlocks"
>;

export function useBlockMeta(session: BlockSession, blockId: string) {
  const [meta, setMeta] = useState(() => session.readBlockMeta(blockId));

  useEffect(() => {
    if (meta) return;
    const read = () => {
      const m = session.readBlockMeta(blockId);
      if (m) setMeta(m);
    };
    // The engine may have attached between render and this effect.
    read();
    return session.subscribeBlocks(read);
  }, [meta, session, blockId]);

  return meta;
}

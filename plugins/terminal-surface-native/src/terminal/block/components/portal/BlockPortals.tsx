/**
 * Portals React chrome into the wterm block containers. The blocks
 * renderer creates a header slot and a body slot per visible block
 * (published through the blockSlots store); this component fills them
 * with the card header (status/cwd/branch/meta/actions + prompt echo)
 * and the resolved body content (widgets, pills, collapse note).
 */
import { useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { useTerminalSession } from "../../../lib/useTerminalSession";
import {
  getMountedBlocks,
  subscribeMountedBlocks,
} from "../../store/blockSlots";
import { BlockBody } from "./BlockBody";
import { BlockHeader } from "./BlockHeader";

type Props = {
  leafId: number;
  session: ReturnType<typeof useTerminalSession>;
  promptReady: boolean;
};

export function BlockPortals({ leafId, session, promptReady }: Props) {
  const subscribe = useCallback(
    (cb: () => void) => subscribeMountedBlocks(leafId, cb),
    [leafId],
  );
  const mounted = useSyncExternalStore(subscribe, () =>
    getMountedBlocks(leafId),
  );

  return (
    <>
      {mounted.map(({ blockId, slots }) => (
        <BlockSlotPair
          key={blockId}
          leafId={leafId}
          blockId={blockId}
          header={slots.header}
          body={slots.body}
          session={session}
          promptReady={promptReady}
        />
      ))}
    </>
  );
}

function BlockSlotPair({
  leafId,
  blockId,
  header,
  body,
  session,
  promptReady,
}: {
  leafId: number;
  blockId: string;
  header: HTMLElement;
  body: HTMLElement;
  session: ReturnType<typeof useTerminalSession>;
  promptReady: boolean;
}) {
  return (
    <>
      {createPortal(
        <BlockHeader
          leafId={leafId}
          blockId={blockId}
          session={session}
          promptReady={promptReady}
        />,
        header,
      )}
      {createPortal(
        <BlockBody leafId={leafId} blockId={blockId} session={session} />,
        body,
      )}
    </>
  );
}

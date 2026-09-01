/**
 * Bridge between the session's block tracking and the wterm blocks-mode
 * renderer: turns BlockDecorations ranges + per-block UI state into the
 * renderer's BlockRange list, and publishes container slots for React
 * portals. Runs on every render frame — keep it allocation-light.
 */
import type { BlocksOptions } from "@wterm/dom";
import { mountBlockSlot, unmountBlockSlot } from "../store/blockSlots";
import { getBlockUi } from "../store/blockUiStore";
import { BLOCK_CHROME, COLLAPSED_BODY_PX } from "./blockChrome";
import type { BlockDecorations } from "./blockDecorations";

export function makeBlocksOptions(
  leafId: number,
  getDeco: () => BlockDecorations | null,
): BlocksOptions {
  return {
    chrome: BLOCK_CHROME,
    provider: () => {
      const deco = getDeco();
      if (!deco) return [];
      return deco.renderRanges().map((b) => {
        const ui = getBlockUi(leafId, b.id);
        const failed = b.exitCode !== null && b.exitCode !== 0;
        if (ui.dismissed) {
          return {
            id: b.id,
            startLine: b.startLine,
            endLine: b.endLine,
            hidden: true,
          };
        }
        if (ui.collapsed) {
          return {
            id: b.id,
            startLine: b.startLine,
            endLine: b.endLine,
            hiddenLeadingLines: b.hiddenLeadingLines,
            rowsHidden: true,
            bodyPx: COLLAPSED_BODY_PX,
            className: failed ? "term-block-fail" : undefined,
          };
        }
        const widgetReplaces = ui.bodyKind === "widget";
        return {
          id: b.id,
          startLine: b.startLine,
          endLine: b.endLine,
          hiddenLeadingLines: b.hiddenLeadingLines,
          rowsHidden: widgetReplaces,
          bodyPx: ui.bodyPx ?? 0,
          className: failed ? "term-block-fail" : undefined,
        };
      });
    },
    onBlockMount: (id, slots) => mountBlockSlot(leafId, id, slots),
    onBlockUnmount: (id) => unmountBlockSlot(leafId, id),
  };
}

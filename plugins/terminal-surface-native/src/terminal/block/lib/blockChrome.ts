/**
 * Block container chrome geometry, shared between the wterm blocks-mode
 * layout table and the CSS that styles the containers. All values are
 * device-independent CSS pixels; keep them in sync with blocks.css.
 */
import type { BlocksChrome } from "@wterm/dom";

/** Header slot: 30px meta bar + 24px prompt-echo line. */
const BLOCK_HEADER_PX = 54;

export const BLOCK_CHROME: BlocksChrome = {
  headerPx: BLOCK_HEADER_PX,
  padXPx: 15,
  padTopPx: 8,
  padBottomPx: 10,
  gapPx: 14,
  borderPx: 1,
};

/** Height of the "… N lines hidden" collapsed body. */
export const COLLAPSED_BODY_PX = 30;

/** Horizontal columns lost to block chrome: body padding + borders. */
export const BLOCK_FIT_INSET_X =
  2 * (BLOCK_CHROME.padXPx + BLOCK_CHROME.borderPx);

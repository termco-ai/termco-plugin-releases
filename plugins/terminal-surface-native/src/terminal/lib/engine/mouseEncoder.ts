/**
 * Mouse-event → escape-sequence encoding for TUI mouse reporting.
 * wterm's input layer captures no mouse events at all, so the app
 * listens on the terminal host and encodes here when the PTY app has
 * enabled a tracking mode (state comes from the stream parser's
 * DECSET tracking — see streamParser/decModes.ts).
 *
 * Only SGR encoding (DECSET 1006) is emitted: every real TUI enables
 * it, and the legacy X10 byte encoding can't express columns > 223.
 */
import type { DecPrivateModes } from "../streamParser/decModes";

export type MouseEventKind = "down" | "up" | "move" | "wheel-up" | "wheel-down";

export type MouseModifiers = {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
};

/** DOM MouseEvent.button (0 left, 1 middle, 2 right). */
export function encodeMouseEvent(
  kind: MouseEventKind,
  button: number,
  mods: MouseModifiers,
  col: number,
  row: number,
  modes: DecPrivateModes,
): string | null {
  if (modes.mouseTracking === "none" || !modes.sgrMouse) return null;

  // Motion events only report under drag (button held) or motion mode;
  // the caller distinguishes hover-motion vs drag-motion via `button`.
  if (kind === "move") {
    if (modes.mouseTracking === "click") return null;
    if (modes.mouseTracking === "drag" && button < 0) return null;
  }

  let code: number;
  switch (kind) {
    case "wheel-up":
      code = 64;
      break;
    case "wheel-down":
      code = 65;
      break;
    case "move":
      code = (button >= 0 && button <= 2 ? button : 3) + 32;
      break;
    default:
      code = button >= 0 && button <= 2 ? button : 3;
  }
  if (mods.shift) code |= 4;
  if (mods.alt) code |= 8;
  if (mods.ctrl) code |= 16;

  const suffix = kind === "up" ? "m" : "M";
  return `\x1b[<${code};${col + 1};${row + 1}${suffix}`;
}

/**
 * Wheel fallback for alt-screen apps without mouse tracking (less, vim
 * without `mouse=a`): arrow-key presses, application-mode aware.
 */
export function wheelFallbackSequence(
  deltaUp: boolean,
  lines: number,
  cursorKeysApp: boolean,
): string {
  const key = deltaUp ? "A" : "B";
  const one = cursorKeysApp ? `\x1bO${key}` : `\x1b[${key}`;
  return one.repeat(Math.max(1, lines));
}

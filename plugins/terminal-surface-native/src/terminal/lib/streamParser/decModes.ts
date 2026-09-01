/**
 * DEC private mode (DECSET/DECRST) state tracking for the PTY stream
 * pre-parser. The wterm core renders mouse/paste sequences but the host app
 * needs to know the *current* mode to decide whether to synthesize mouse
 * reports or wrap pastes in bracketed-paste markers — so we shadow the modes
 * here as the sequences fly by (they are still forwarded to the core).
 */

type MouseTracking = "none" | "click" | "drag" | "motion";

export type DecPrivateModes = {
  mouseTracking: MouseTracking;
  sgrMouse: boolean;
  bracketedPaste: boolean;
};

// Modes 1000/1002/1003 are independent flags in the wire protocol (an app may
// set 1003 on top of 1000 and later reset only 1003), so they are tracked
// separately here and collapsed to the highest active level for consumers.
// Kept off the public type on purpose: callers only ever need the effective
// level.
type TrackingFlags = { click: boolean; drag: boolean; motion: boolean };

const trackingFlags = new WeakMap<DecPrivateModes, TrackingFlags>();

export function initialDecModes(): DecPrivateModes {
  const modes: DecPrivateModes = {
    mouseTracking: "none",
    sgrMouse: false,
    bracketedPaste: false,
  };
  trackingFlags.set(modes, { click: false, drag: false, motion: false });
  return modes;
}

/**
 * Applies one `CSI ? Pm h` (set = true) / `CSI ? Pm l` (set = false) to the
 * state. `params` are the numeric parameters; unknown modes are ignored.
 */
export function applyDecMode(
  modes: DecPrivateModes,
  params: number[],
  set: boolean,
): void {
  let flags = trackingFlags.get(modes);
  if (!flags) {
    flags = { click: false, drag: false, motion: false };
    trackingFlags.set(modes, flags);
  }
  for (const p of params) {
    switch (p) {
      case 1000:
        flags.click = set;
        break;
      case 1002:
        flags.drag = set;
        break;
      case 1003:
        flags.motion = set;
        break;
      case 1006:
        modes.sgrMouse = set;
        break;
      case 2004:
        modes.bracketedPaste = set;
        break;
    }
  }
  modes.mouseTracking = flags.motion
    ? "motion"
    : flags.drag
      ? "drag"
      : flags.click
        ? "click"
        : "none";
}

/**
 * Pure helpers for the embedded-browser module. No `electron` imports so the
 * node-vitest tier (vitest.electron.config.ts) can cover them directly.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Chord the renderer wants intercepted while an embedded page has focus. */
export interface ChordSpec {
  /** Matched case-insensitively against KeyboardEvent.key ("t", "Tab", …). */
  key: string;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** Shape of Electron's before-input-event `input` we care about. */
export interface KeyInput {
  type: string;
  key: string;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export function viewKey(label: string, tabId: number): string {
  return `${label}:${tabId}`;
}

/** Round + clamp a renderer-measured rect into valid DIP view bounds. */
export function normalizeRect(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

export function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

/**
 * True when a key event matches one of the registered chords. Modifiers must
 * match exactly (an unspecified modifier means "must not be held") so Cmd+T
 * doesn't also swallow Cmd+Shift+T unless both are registered.
 */
export function matchChord(
  input: KeyInput,
  chords: readonly ChordSpec[],
): boolean {
  if (input.type !== "keyDown" && input.type !== "rawKeyDown") return false;
  const key = input.key.toLowerCase();
  return chords.some(
    (c) =>
      c.key.toLowerCase() === key &&
      (c.control ?? false) === (input.control ?? false) &&
      (c.meta ?? false) === (input.meta ?? false) &&
      (c.shift ?? false) === (input.shift ?? false) &&
      (c.alt ?? false) === (input.alt ?? false),
  );
}

/**
 * Strip Electron/app tokens from a Chromium user agent so login providers that
 * block embedded browsers (notably Google) treat the view as plain Chrome.
 */
export function sanitizeUserAgent(ua: string, appName: string): string {
  const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return ua
    .replace(new RegExp(`\\s${escaped}/\\S+`, "i"), "")
    .replace(/\sElectron\/\S+/i, "");
}

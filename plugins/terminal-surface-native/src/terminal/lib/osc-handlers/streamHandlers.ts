/**
 * Stream-parser variants of the OSC handlers (OSC 7 cwd, OSC 52
 * clipboard, OSC 133 prompt tracking) for the wterm engine. They share
 * the pure parse/validation logic with the xterm-based variants; only
 * the registration surface differs — handlers attach to the session's
 * PtyStreamParser (which sees PTY bytes before the terminal core) and
 * prompt markers become TerminalLineSpace anchors.
 *
 * The xterm variants remain alongside until the engine swap removes
 * them; both share `ShellIntegrationState` semantics (OSC 7 emitted by
 * command output is untrusted and ignored while a command runs).
 */
import type { Anchor, TerminalLineSpace } from "../lineSpace";
import type { PtyStreamParser } from "../streamParser";
import { type ClipboardWriter, parseOsc52Clipboard } from "./clipboard";
import { type ShellIntegrationState, parseOsc7 } from "./shellIntegration";

export function registerCwdStreamHandler(
  parser: PtyStreamParser,
  onCwd: (cwd: string) => void,
  state?: ShellIntegrationState,
): () => void {
  return parser.registerOscHandler(7, (data) => {
    if (state?.inCommand) return true;
    const cwd = parseOsc7(data);
    if (cwd) onCwd(cwd);
    return true;
  });
}

export function registerOsc52StreamHandler(
  parser: PtyStreamParser,
  writeClipboard: ClipboardWriter,
): () => void {
  return parser.registerOscHandler(52, (data) => {
    const text = parseOsc52Clipboard(data);
    if (text === null) return true;
    queueMicrotask(() => {
      try {
        void Promise.resolve(writeClipboard(text)).catch(() => {});
      } catch {}
    });
    return true;
  });
}

export type StreamPromptTracker = {
  /** Anchor at the most recent prompt start (OSC 133 A), if still live. */
  getMarker: () => Anchor | null;
  dispose: () => void;
};

export function registerPromptStreamTracker(
  parser: PtyStreamParser,
  lineSpace: TerminalLineSpace,
  state?: ShellIntegrationState,
  // Fires on C (process executing) and A/D (back at prompt). Distinct from
  // inCommand, which is already true from B while the user merely types.
  onCommandState?: (running: boolean) => void,
): StreamPromptTracker {
  let anchor: Anchor | null = null;
  const dispose = parser.registerOscHandler(133, (data, ctx) => {
    if (data.startsWith("A")) {
      if (state) state.inCommand = false;
      onCommandState?.(false);
      anchor?.dispose();
      anchor = lineSpace.createAnchor(lineSpace.toAbsolute(ctx.bufferLine));
    } else if (data.startsWith("B")) {
      if (state) state.inCommand = true;
    } else if (data.startsWith("C")) {
      if (state) state.inCommand = true;
      onCommandState?.(true);
    } else if (data.startsWith("D")) {
      if (state) state.inCommand = false;
      onCommandState?.(false);
    }
    return true;
  });
  return {
    getMarker: () => (anchor && !anchor.isDisposed ? anchor : null),
    dispose: () => {
      dispose();
      anchor?.dispose();
      anchor = null;
    },
  };
}

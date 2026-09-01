/**
 * Keyboard and mouse interception for wterm slots. wterm has no
 * `attachCustomKeyEventHandler`, so app shortcuts are claimed by a
 * capture-phase keydown listener on the slot host — it runs before
 * wterm's hidden-textarea handler, and `stopPropagation` keeps claimed
 * keys away from it. Mouse events are encoded for TUI mouse reporting
 * (wterm captures no mouse input at all).
 */
import {
  encodeMouseEvent,
  wheelFallbackSequence,
  type MouseEventKind,
} from "../engine";
import {
  terminalDeleteSequence,
  terminalLineNavigationSequence,
  terminalWordNavigationSequence,
} from "../keymap";
import {
  readTerminalClipboard,
  writeTerminalClipboard,
} from "../terminalClipboard";
import { engineSelectionText } from "../engine";
import {
  IS_MAC,
  isShiftEnter,
  isTerminalCopy,
  isTerminalPaste,
} from "./keyboardShortcuts";
import type { LeafBridge, Slot } from "./types";

type ResolveBridge = (slot: Slot) => LeafBridge | null;

export function attachInputInterceptor(
  slot: Slot,
  resolveBridge: ResolveBridge,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    // During IME composition the browser is assembling a multi-keystroke
    // character; raw keydowns (including the Enter that commits a
    // candidate) must reach neither the PTY nor our shortcuts — wterm's
    // own compositionend handler delivers the final string.
    if (event.isComposing || event.keyCode === 229) return;

    const bridge = resolveBridge(slot);
    if (!bridge) return;

    const claim = (seq?: string | null) => {
      if (seq) bridge.writeToPty(seq);
      event.preventDefault();
      event.stopPropagation();
    };

    const lineNav = terminalLineNavigationSequence(event, { isMac: IS_MAC });
    if (lineNav) return claim(lineNav);
    const wordNav = terminalWordNavigationSequence(event);
    if (wordNav) return claim(wordNav);
    const deleteSeq = terminalDeleteSequence(event, { isMac: IS_MAC });
    if (deleteSeq) return claim(deleteSeq);

    // wterm would encode Shift+Enter kitty-style (\x1b[13;2u); the app's
    // contract is ESC+CR.
    if (isShiftEnter(event)) return claim("\x1b\r");

    if (isTerminalCopy(event)) {
      const sel = engineSelectionText(slot.engine.element);
      if (sel) void writeTerminalClipboard(sel);
      return claim();
    }
    if (isTerminalPaste(event)) {
      const targetLeafId = slot.currentLeafId;
      void readTerminalClipboard().then((text) => {
        if (text && slot.currentLeafId === targetLeafId) {
          slot.engine.paste(text);
        }
      });
      return claim();
    }
  };

  const mouseKind = (e: MouseEvent): MouseEventKind =>
    e.type === "mousedown" ? "down" : e.type === "mouseup" ? "up" : "move";

  let buttonHeld = -1;

  const onMouse = (e: MouseEvent) => {
    const bridge = resolveBridge(slot);
    const modes = bridge?.getDecModes();
    if (!bridge || !modes || modes.mouseTracking === "none") return;
    // Shift bypasses reporting so native text selection stays reachable
    // (xterm convention).
    if (e.shiftKey) return;
    const cell = slot.engine.pointToCell(e.clientX, e.clientY);
    if (!cell) return;

    const kind = mouseKind(e);
    if (kind === "down") buttonHeld = e.button;
    const seq = encodeMouseEvent(
      kind,
      kind === "move" ? buttonHeld : e.button,
      { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey },
      cell.col,
      cell.row,
      modes,
    );
    if (kind === "up") buttonHeld = -1;
    if (!seq) return;
    bridge.writeToPty(seq);
    e.preventDefault();
    e.stopPropagation();
  };

  const onWheel = (e: WheelEvent) => {
    const bridge = resolveBridge(slot);
    if (!bridge) return;
    const modes = bridge.getDecModes();
    const cell = slot.engine.pointToCell(e.clientX, e.clientY);

    if (modes && modes.mouseTracking !== "none" && !e.shiftKey && cell) {
      const seq = encodeMouseEvent(
        e.deltaY < 0 ? "wheel-up" : "wheel-down",
        0,
        { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey },
        cell.col,
        cell.row,
        modes,
      );
      if (seq) {
        bridge.writeToPty(seq);
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    // Alt-screen apps have no scrollback to scroll natively; translate
    // the wheel to arrow keys (application-cursor aware) like xterm.
    if (slot.engine.usingAltScreen()) {
      bridge.writeToPty(
        wheelFallbackSequence(e.deltaY < 0, 3, slot.engine.cursorKeysApp()),
      );
      e.preventDefault();
      e.stopPropagation();
    }
  };

  slot.host.addEventListener("keydown", onKeyDown, { capture: true });
  slot.host.addEventListener("mousedown", onMouse, { capture: true });
  slot.host.addEventListener("mouseup", onMouse, { capture: true });
  slot.host.addEventListener("mousemove", onMouse, { capture: true });
  slot.host.addEventListener("wheel", onWheel, {
    capture: true,
    passive: false,
  });

  return () => {
    slot.host.removeEventListener("keydown", onKeyDown, { capture: true });
    slot.host.removeEventListener("mousedown", onMouse, { capture: true });
    slot.host.removeEventListener("mouseup", onMouse, { capture: true });
    slot.host.removeEventListener("mousemove", onMouse, { capture: true });
    slot.host.removeEventListener("wheel", onWheel, { capture: true });
  };
}

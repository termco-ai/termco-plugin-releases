import { ensureMonoFontsLoaded } from "../../../fonts";
import { usePreferencesStore } from "../../../preferences";
import { terminalRuntime, type WorkspaceEnv } from "../../../runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BlockDecorations,
  type BlockMatch,
  type RenderableBlock,
  type VisibleBlocks,
} from "../../block/lib/blockDecorations";
import { BLOCK_FIT_INSET_X } from "../../block/lib/blockChrome";
import { makeBlocksOptions } from "../../block/lib/blocksProvider";
import {
  clearLeafBlockUi,
  onAnyBlockUiChange,
} from "../../block/store/blockUiStore";
import type { BlockMode } from "../../block/lib/modeMachine";
import { DormantRing } from "../dormantRing";
import { engineSelectionText } from "../engine";
import { TerminalLineSpace } from "../lineSpace";
import {
  createShellIntegrationState,
  registerCwdStreamHandler,
  registerOsc52StreamHandler,
  registerPromptStreamTracker,
} from "../osc-handlers";
import { openPty, type PtySession } from "../pty-bridge";
import { PtyStreamParser, type ParserSink } from "../streamParser";
import { createTerminalSearch } from "../terminalSearch";
import {
  ensureAgentActivityListener,
  isAgentActivePty,
} from "../agentActivity";
import {
  acquireSlot,
  applyBackgroundActive,
  applyCursorBlink,
  applyFontFamily,
  applyFontSize,
  applyFontWeight,
  applyLetterSpacing,
  applyTheme as applyPoolTheme,
  configureRendererPool,
  discardRetainedSlot,
  disposeLeafSlot,
  focusSlot,
  getLiveSlotForLeaf,
  getSlotForLeaf,
  isLeafAltScreen,
  parkLeafSlot,
  poolSize,
  poolSlotStats,
  refreshLeafSlot,
  releaseSlot,
  setSlotFocused,
} from "../rendererPool";
import { stripAnsi } from "./ansiStrip";
import { disposeReadyWaiters, markSessionReady } from "./readyRegistry";
import type { Callbacks, Options, Session } from "./types";

export { whenSessionReady } from "./readyRegistry";

const sessions = new Map<number, Session>();

// The workspace footer and terminal surface are sibling plugin contributions.
// The footer may mount first, so retain its focus callback until the terminal
// session for that leaf exists instead of dropping the registration.
const inputFocusCallbacks = new Map<number, () => void>();

// Block-overlay viewport listeners, keyed by leafId at module scope so the
// overlay (a child) can subscribe before the parent effect creates the session.
const blockViewportListeners = new Map<number, Set<() => void>>();

// Collapse/dismiss/widget-height changes must relayout the leaf's renderer.
onAnyBlockUiChange((leafId) => {
  getLiveSlotForLeaf(leafId)?.engine.setBlocksDirty();
});

const PENDING_INPUT_MAX = 256 * 1024;

// Input typed before the pty attaches is queued and flushed on attach. Cap the
// queue so a large paste into a still-spawning pane can't grow it without bound.
function queuePendingInput(s: Session, data: string): void {
  if (s.pendingInput.length + data.length > PENDING_INPUT_MAX) return;
  s.pendingInput += data;
}

export function writeToSession(leafId: number, data: string): boolean {
  const s = sessions.get(leafId);
  if (!s || s.shellExited) return false;
  if (s.pty) {
    void s.pty.write(data);
    return true;
  }
  queuePendingInput(s, data);
  return true;
}

export function submitToLeaf(leafId: number, text: string): void {
  const s = sessions.get(leafId);
  if (!s || s.shellExited) return;
  s.everSubmitted = true;
  // Fallback command text for the upcoming block: bash's shell integration
  // emits its 133;C marker without the command payload (PS0 can't carry it),
  // so the block would otherwise have no command — no header text, no
  // ls/git-status widgets. zsh payloads still take precedence in startBlock.
  s.blockDecorations?.notePendingCommand(text);
  // Bracketed paste keeps a multiline command atomic; trailing CR runs it.
  const data = text.includes("\n")
    ? `\x1b[200~${text}\x1b[201~\r`
    : `${text}\r`;
  if (s.pty) void s.pty.write(data);
  else queuePendingInput(s, data);
}

export function interruptLeaf(leafId: number): void {
  sessions.get(leafId)?.pty?.write("\x03");
}

export function leafCwd(leafId: number): string | null {
  return sessions.get(leafId)?.lastCwd ?? null;
}

export function navigateFocusedBlocks(dir: -1 | 1): boolean {
  for (const [, s] of sessions) {
    if (!s.visibleNow || !s.focusedNow || !s.blockDecorations) continue;
    s.blockDecorations.navigateBlocks(dir);
    return true;
  }
  return false;
}

export function clearLeafBlockSelection(leafId: number): boolean {
  return sessions.get(leafId)?.blockDecorations?.clearBlockSelection() ?? false;
}

export function leafGridSelection(leafId: number): string | null {
  const slot = getSlotForLeaf(leafId);
  return slot ? engineSelectionText(slot.engine.element) : null;
}

export function getLeafBlockMode(leafId: number): BlockMode {
  return sessions.get(leafId)?.blockMode ?? "prompt";
}

export function subscribeLeafBlockMode(
  leafId: number,
  cb: () => void,
): () => void {
  const s = sessions.get(leafId);
  if (!s) return () => {};
  s.blockListeners.add(cb);
  return () => {
    s.blockListeners.delete(cb);
  };
}

export function setLeafInputFocus(
  leafId: number,
  fn: (() => void) | null,
): void {
  if (fn) inputFocusCallbacks.set(leafId, fn);
  else inputFocusCallbacks.delete(leafId);
  const s = sessions.get(leafId);
  if (s) {
    s.inputFocus = fn;
    if (
      fn &&
      s.blocks &&
      s.blockMode === "prompt" &&
      s.visibleNow &&
      s.focusedNow
    ) {
      setTimeout(fn, 0);
    }
  }
}

export function focusLeafInput(leafId: number): void {
  (sessions.get(leafId)?.inputFocus ?? inputFocusCallbacks.get(leafId))?.();
}

export function getLeafDraft(leafId: number): string {
  return sessions.get(leafId)?.inputDraft ?? "";
}

export function setLeafDraft(leafId: number, text: string): void {
  const s = sessions.get(leafId);
  if (s) s.inputDraft = text;
}

export function setLeafInputActivity(leafId: number, active: boolean): void {
  const s = sessions.get(leafId);
  if (!s || s.inputActive === active) return;
  s.inputActive = active;
  const set = blockViewportListeners.get(leafId);
  if (set) for (const l of set) l();
}

export type WatermarkState = "visible" | "hidden" | "dead";

// Watermark gate: a block terminal that has never run a command, whose grid is
// still untouched, and whose input is empty. Synchronous so tab switches, slot
// rebinds and the Enter-to-OSC-133 gap never flash it over real content.
// "dead" is permanent and lets the component unmount for good. The grid check
// scans glyphs, not the cursor: the prompt integration prints a blank gap line
// at spawn, so the cursor sits below row 0 even on a visually empty terminal.
export function blockWatermarkState(leafId: number): WatermarkState {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return "dead";
  if (s.everSubmitted || s.blockDecorations?.hasAnyBlock()) return "dead";
  if (!s.blocks || s.inputActive) return "hidden";
  const slot = getSlotForLeaf(leafId);
  if (!slot) return "hidden";
  if (slot.engine.scrollbackCount() > 0) return "dead";
  if (slot.engine.viewportHasGlyphs()) return "dead";
  return "visible";
}

/**
 * Clear the scrollback and screen of the currently focused terminal, keeping
 * the active prompt line — macOS Terminal's ⌘K behaviour. Returns false when no
 * focused terminal slot is bound (e.g. focus is in the editor or AI panel).
 */
export function clearFocusedTerminal(): boolean {
  for (const [leafId, s] of sessions) {
    if (!s.visibleNow || !s.focusedNow) continue;
    const slot = getSlotForLeaf(leafId);
    if (!slot) continue;
    slot.engine.clear();
    return true;
  }
  return false;
}

export function leafIdForPty(ptyId: number): number | null {
  for (const [leafId, s] of sessions) {
    if (s.pty?.id === ptyId) return leafId;
  }
  return null;
}

function leafBusy(s: Session): boolean {
  return s.commandRunning || (s.pty !== null && isAgentActivePty(s.pty.id));
}

const HIDDEN_RELEASE_DELAY_MS = 300;

// A parked hidden leaf went idle: give the post-command prompt a moment to
// render into the live buffer, then hand the slot back to the pool.
function scheduleHiddenRelease(leafId: number, s: Session): void {
  if (s.visibleNow || !s.hasSlot) return;
  cancelHiddenRelease(s);
  s.hiddenReleaseTimer = setTimeout(() => {
    s.hiddenReleaseTimer = null;
    if (s.disposed || s.visibleNow || !s.hasSlot) return;
    if (s.blocks || isLeafAltScreen(leafId) || leafBusy(s)) return;
    unbindLeafFromSlot(leafId, s);
  }, HIDDEN_RELEASE_DELAY_MS);
}

function cancelHiddenRelease(s: Session): void {
  if (s.hiddenReleaseTimer !== null) {
    clearTimeout(s.hiddenReleaseTimer);
    s.hiddenReleaseTimer = null;
  }
}

async function releaseIfIdle(leafId: number, s: Session): Promise<void> {
  const busy = await leafHasForegroundJob(leafId);
  if (busy || s.disposed || s.visibleNow || !s.hasSlot) return;
  if (s.blocks || isLeafAltScreen(leafId) || leafBusy(s)) return;
  unbindLeafFromSlot(leafId, s);
}

async function leafHasForegroundJob(leafId: number): Promise<boolean> {
  const s = sessions.get(leafId);
  if (!s?.pty || s.shellExited) return false;
  try {
    return await terminalRuntime().pty.hasForegroundJob(s.pty.id);
  } catch (e) {
    console.error("[termco] pty_has_foreground_job failed for leaf", leafId, e);
    return false;
  }
}

function onLeafCommandState(leafId: number, running: boolean): void {
  const s = sessions.get(leafId);
  if (!s || s.commandRunning === running) return;
  s.commandRunning = running;
  if (!running) {
    scheduleHiddenRelease(leafId, s);
    return;
  }
  cancelHiddenRelease(s);
  // A command started in a hidden released leaf (e.g. submitted by the AI):
  // rebind its retained slot so output parses live instead of filling the
  // ring. Deferred: this callback fires inside xterm's parse loop and the
  // rebind touches the same terminal (fit/resize).
  if (!s.visibleNow && !s.hasSlot && s.container && !s.disposed) {
    setTimeout(() => {
      if (s.disposed || s.visibleNow || s.hasSlot || !s.container) return;
      if (!leafBusy(s)) return;
      bindLeafToSlot(leafId, s);
      parkLeafSlot(leafId);
    }, 0);
  }
}

ensureAgentActivityListener((ptyId) => {
  const leafId = leafIdForPty(ptyId);
  if (leafId === null) return;
  const s = sessions.get(leafId);
  if (s) scheduleHiddenRelease(leafId, s);
});

configureRendererPool({
  resolveLeaf(leafId) {
    const s = sessions.get(leafId);
    if (!s) return null;
    return {
      writeToPty: (data) => {
        // Shell spawn failed (bad cwd, missing binary): Enter retries.
        if (s.spawnFailed) {
          if (data.includes("\r")) void respawnSession(leafId);
          return;
        }
        if (s.pty) void s.pty.write(data);
        else queuePendingInput(s, data);
      },
      resizePty: (cols, rows) => {
        s.cols = cols;
        s.rows = rows;
        s.pty?.resize(cols, rows);
      },
      kickPty: (cols, rows) => {
        const pty = s.pty;
        if (!pty || cols <= 0 || rows <= 0) return;
        // Linux only emits SIGWINCH when the winsize ioctl actually
        // changes dims, so bump +1 row then restore. The TUI receives
        // (possibly two) SIGWINCHes and repaints from scratch.
        pty
          .resize(cols, rows + 1)
          .then(() => pty.resize(cols, rows))
          .catch((e) => console.warn("[termco] kickPty failed:", e));
      },
      getDecModes: () => s.parser.modes,
    };
  },
  evictLeaf(leafId) {
    const s = sessions.get(leafId);
    if (!s) return;
    unbindLeafFromSlot(leafId, s);
  },
  isLeafFocused(leafId) {
    const s = sessions.get(leafId);
    return !!s && s.visibleNow && s.focusedNow;
  },
  isLeafBlocks(leafId) {
    return sessions.get(leafId)?.blocks ?? false;
  },
  isLeafBusy(leafId) {
    const s = sessions.get(leafId);
    return !!s && leafBusy(s);
  },
  isLeafVisible(leafId) {
    return sessions.get(leafId)?.visibleNow ?? false;
  },
  storeSnapshot(leafId, out) {
    const s = sessions.get(leafId);
    if (!s) return;
    s.snapshot = out.snapshot;
    if (out.cols > 0) s.cols = out.cols;
    if (out.rows > 0) s.rows = out.rows;
    s.altScreenAtRelease = out.altScreen;
    // Absolute line of the snapshot's first line; on restore the line
    // rig rebases here so block anchors survive slot recycling.
    const core = getLiveSlotForLeaf(leafId)?.engine.core();
    if (core) {
      const total = core.getScrollbackCount() + core.getRows();
      s.snapshotBase = s.lineSpace.toAbsolute(Math.max(0, total - out.lines));
    } else {
      s.snapshotBase = null;
    }
  },
});

function ensureSession(
  leafId: number,
  workspace: WorkspaceEnv,
  initialCwd?: string,
  blocks = false,
): Session {
  const existing = sessions.get(leafId);
  if (existing) return existing;

  const session: Session = {
    pty: null,
    ptyOpening: false,
    // The env of the rig this terminal is created in (stays with the terminal
    // for its lifetime — a terminal never moves between rigs).
    env: workspace,
    initialCwd,
    lastCwd: null,
    pendingExit: null,
    shellExited: false,
    callbacks: {},
    visibleNow: false,
    focusedNow: false,
    disposed: false,
    ready: Promise.resolve(),
    cols: 0,
    rows: 0,
    container: null,
    snapshot: null,
    dormantRing: new DormantRing(),
    pendingInput: "",
    hasSlot: false,
    blocks,
    blockMode: "prompt",
    blockListeners: new Set(),
    blockDecorations: null,
    inputFocus: inputFocusCallbacks.get(leafId) ?? null,
    inputDraft: "",
    inputActive: false,
    everSubmitted: false,
    altScreenAtRelease: false,
    commandRunning: false,
    hiddenReleaseTimer: null,
    spawnFailed: false,
    parser: new PtyStreamParser(),
    lineSpace: new TerminalLineSpace(),
    searchHandle: createTerminalSearch(
      () => getLiveSlotForLeaf(leafId)?.engine ?? null,
    ),
    oscDisposers: [],
    snapshotBase: null,
  };
  sessions.set(leafId, session);

  // OSC handling is session-scoped: the stream parser sees PTY bytes
  // before the terminal core, so cwd/prompt/clipboard tracking keeps
  // working while the leaf is dormant (ring-buffered) or slot-recycled.
  const osc52 = registerOsc52StreamHandler(session.parser, (text) =>
    navigator.clipboard.writeText(text),
  );
  const onCwdUpdate = (next: string) => {
    markSessionReady(leafId);
    if (session.lastCwd === next) return;
    session.lastCwd = next;
    session.callbacks.onCwd?.(next);
  };
  if (blocks) {
    // Blocks sessions: BlockDecorations owns OSC 133 (block boundaries +
    // mode machine) and the cwd handler (shared in-command gating).
    const deco = new BlockDecorations(
      { parser: session.parser, lineSpace: session.lineSpace },
      {
        onCwd: onCwdUpdate,
        onMode: (mode) => {
          onLeafCommandState(leafId, mode !== "prompt");
          applyBlockMode(leafId, mode);
        },
        onViewport: () => {
          const set = blockViewportListeners.get(leafId);
          if (set) for (const l of set) l();
        },
      },
    );
    session.blockDecorations = deco;
    session.oscDisposers = [() => deco.dispose(), osc52];
  } else {
    const shellState = createShellIntegrationState();
    const prompt = registerPromptStreamTracker(
      session.parser,
      session.lineSpace,
      shellState,
      (running) => onLeafCommandState(leafId, running),
    );
    const cwd = registerCwdStreamHandler(
      session.parser,
      onCwdUpdate,
      shellState,
    );
    session.oscDisposers = [prompt.dispose, cwd, osc52];
  }

  session.ready = (async () => {
    await ensureMonoFontsLoaded();
    await document.fonts.ready;
  })();

  return session;
}

/** Sink adapting one leaf's engine (or ring writer) to the stream parser. */
function parserSink(
  leafId: number,
  s: Session,
  write: (bytes: Uint8Array) => void,
): ParserSink {
  const core = () => getLiveSlotForLeaf(leafId)?.engine.core() ?? null;
  return {
    write,
    respond: (data) => {
      if (s.pty) void s.pty.write(data);
    },
    currentBufferLine: () => {
      const c = core();
      return c ? c.getScrollbackCount() + c.getCursor().row : 0;
    },
    cursorPosition: () => {
      const c = core()?.getCursor();
      return c ? { row: c.row, col: c.col } : { row: 0, col: 0 };
    },
  };
}

function deliverPtyBytes(leafId: number, bytes: Uint8Array): void {
  const s = sessions.get(leafId);
  if (!s) return;
  // Retained slots keep parsing live (render paused); the ring is only for
  // leaves whose buffer was stolen or never bound. Live bytes flow through
  // the stream parser (OSC extraction, DEC modes, query answers); dormant
  // bytes are ring-buffered raw and parsed on drain.
  const slot = getLiveSlotForLeaf(leafId);
  if (slot) {
    s.parser.push(
      bytes,
      parserSink(leafId, s, (span) => slot.engine.write(span)),
    );
  } else {
    s.dormantRing.push(bytes);
  }
}

const SPAWN_RETRY_DELAY_MS = 250;

async function openPtyWithRetry(
  leafId: number,
  s: Session,
  cwd: string | undefined,
): Promise<PtySession> {
  try {
    return await openPtyForSession(leafId, s, cwd);
  } catch (e) {
    console.error("[termco] openPty failed, retrying once:", e);
    await new Promise((r) => setTimeout(r, SPAWN_RETRY_DELAY_MS));
    if (s.disposed) throw e;
    return openPtyForSession(leafId, s, cwd);
  }
}

// Spawn failure must not flow through onExit: handleLeafExit closes the pane
// (or respawns the last one, which would loop). Show the error in the pane
// and let Enter retry instead of leaving a dead black grid.
function surfaceSpawnFailure(leafId: number, s: Session, e: unknown): void {
  console.error("[termco] shell spawn failed:", e);
  s.shellExited = true;
  s.spawnFailed = true;
  const detail = String(e)
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .slice(0, 300);
  deliverPtyBytes(
    leafId,
    new TextEncoder().encode(
      `\r\n\x1b[31m[termco] failed to start shell: ${detail}\x1b[0m\r\n\x1b[2mpress Enter to retry\x1b[0m\r\n`,
    ),
  );
}

async function openPtyForSession(
  leafId: number,
  s: Session,
  cwd: string | undefined,
): Promise<PtySession> {
  const startCols = s.cols > 0 ? s.cols : 80;
  const startRows = s.rows > 0 ? s.rows : 24;
  const pty = await openPty(
    startCols,
    startRows,
    {
      onData: (bytes) => deliverPtyBytes(leafId, bytes),
      onExit: (code) => {
        if (s.disposed) return;
        s.shellExited = true;
        s.pty = null;
        s.pendingInput = "";
        s.commandRunning = false;
        getSlotForLeaf(leafId)?.engine.setStdinEnabled(false);
        scheduleHiddenRelease(leafId, s);
        if (s.callbacks.onExit) s.callbacks.onExit(code);
        else s.pendingExit = code;
      },
    },
    s.env,
    cwd,
    s.blocks,
    usePreferencesStore.getState().terminalShell || undefined,
  );
  // Only resize if the bound dims changed during the spawn: a same-size
  // ResizePseudoConsole during conhost warmup is a known ConPTY trigger for
  // a console that never renders (blank tab).
  if (
    s.cols > 0 &&
    s.rows > 0 &&
    (s.cols !== startCols || s.rows !== startRows)
  ) {
    void pty.resize(s.cols, s.rows);
  }
  return pty;
}

function applyBlockMode(leafId: number, mode: BlockMode): void {
  const s = sessions.get(leafId);
  if (!s) return;
  s.blockMode = mode;
  s.commandRunning = mode !== "prompt";
  const slot = getSlotForLeaf(leafId);
  if (slot) {
    const prompt = mode === "prompt";
    // Disable the grid's input at the prompt so a grid click can't focus
    // the terminal (no flashing cursor) or steal focus from the shell input.
    slot.engine.setStdinEnabled(!prompt);
    if (!prompt) {
      slot.engine.focus();
    } else if (s.visibleNow && s.focusedNow) {
      const inputFocus = s.inputFocus;
      if (inputFocus) setTimeout(inputFocus, 0);
    }
  }
  for (const l of s.blockListeners) l();
}

function bindLeafToSlot(leafId: number, s: Session): void {
  if (!s.container) return;
  const altScreen = s.altScreenAtRelease;
  s.altScreenAtRelease = false;
  acquireSlot({
    leafId,
    container: s.container,
    snapshot: s.snapshot,
    altScreen,
    // Ring bytes are raw PTY output; route them through the session
    // parser on drain so OSC/DEC tracking stays exact.
    drainRing: (write) =>
      s.dormantRing.drain((bytes) =>
        s.parser.push(bytes, parserSink(leafId, s, write)),
      ),
    // Keep stdin alive after a spawn failure so Enter can trigger the retry.
    shellExited: s.shellExited && !s.spawnFailed,
    cols: s.cols,
    rows: s.rows,
  });
  // OSC handlers are session-scoped (registered in ensureSession); the
  // slot only renders. Block decorations get the engine for geometry.
  const bound = getSlotForLeaf(leafId);
  if (bound) {
    s.blockDecorations?.attach(bound.engine);
    // Blocks leaves render through the engine's blocks mode (real HTML
    // containers per command); classic leaves must clear any blocks
    // config a recycled slot carries.
    bound.engine.setBlocks(
      s.blocks && s.blockDecorations
        ? makeBlocksOptions(leafId, () => s.blockDecorations)
        : null,
      BLOCK_FIT_INSET_X,
    );
  }
  // A replayed snapshot rebuilt the buffer from its own line 0; rebase
  // the absolute line rig so anchors keep pointing at their content.
  if (s.snapshot && s.snapshotBase !== null) {
    s.lineSpace.rebase(s.snapshotBase);
  }
  s.snapshotBase = null;
  s.callbacks.onSearchReady?.(s.searchHandle);
  s.snapshot = null;
  s.hasSlot = true;
  if (s.blocks) applyBlockMode(leafId, s.blockMode);
  if (s.lastCwd !== null) s.callbacks.onCwd?.(s.lastCwd);
  if (s.pendingExit !== null) {
    const code = s.pendingExit;
    s.pendingExit = null;
    s.callbacks.onExit?.(code);
  }
}

function unbindLeafFromSlot(leafId: number, s: Session): void {
  if (!s.hasSlot) return;
  s.blockDecorations?.detach();
  const out = releaseSlot(leafId);
  if (out) {
    if (out.cols > 0) s.cols = out.cols;
    if (out.rows > 0) s.rows = out.rows;
  }
  s.hasSlot = false;
}

function attachSession(
  leafId: number,
  container: HTMLDivElement,
  callbacks: Callbacks,
): void {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return;
  s.callbacks = callbacks;
  s.container = container;

  if (s.visibleNow) bindLeafToSlot(leafId, s);

  if (!s.pty && !s.ptyOpening && !s.shellExited) {
    s.ptyOpening = true;
    openPtyWithRetry(leafId, s, s.initialCwd)
      .then((pty) => {
        s.ptyOpening = false;
        if (s.disposed) {
          pty.close();
          return;
        }
        s.pty = pty;
        if (s.pendingInput) {
          void pty.write(s.pendingInput);
          s.pendingInput = "";
        }
        if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
      })
      .catch((e) => {
        s.ptyOpening = false;
        if (!s.disposed) surfaceSpawnFailure(leafId, s, e);
      });
  }
}

function detachSession(leafId: number): void {
  const s = sessions.get(leafId);
  if (!s) return;
  unbindLeafFromSlot(leafId, s);
  s.callbacks = {};
  s.container = null;
}

async function respawnSession(
  leafId: number,
  cwd?: string,
): Promise<void> {
  const s = sessions.get(leafId);
  if (!s || s.disposed) return;
  s.pty?.close();
  s.pty = null;
  s.snapshot = null;
  s.dormantRing = new DormantRing();
  s.shellExited = false;
  s.pendingExit = null;
  s.pendingInput = "";
  s.altScreenAtRelease = false;
  s.commandRunning = false;
  s.spawnFailed = false;
  cancelHiddenRelease(s);

  s.parser.reset();
  s.lineSpace.notifyReset();
  const slot = getSlotForLeaf(leafId);
  if (slot) {
    slot.engine.setStdinEnabled(true);
    slot.engine.reset();
  } else {
    discardRetainedSlot(leafId);
  }

  s.ptyOpening = true;
  let pty: PtySession;
  try {
    pty = await openPtyWithRetry(leafId, s, cwd ?? s.initialCwd);
  } catch (e) {
    s.ptyOpening = false;
    if (!s.disposed) surfaceSpawnFailure(leafId, s, e);
    return;
  }
  s.ptyOpening = false;
  if (s.disposed) {
    pty.close();
    return;
  }
  s.pty = pty;
  if (s.pendingInput) {
    void pty.write(s.pendingInput);
    s.pendingInput = "";
  }
  if (s.cols > 0 && s.rows > 0) pty.resize(s.cols, s.rows);
}

export async function leafHasForegroundProcess(
  leafId: number,
): Promise<boolean> {
  const s = sessions.get(leafId);
  if (!s?.pty || s.shellExited) return false;
  try {
    const result = await terminalRuntime().pty.hasForegroundProcess(s.pty.id);
    return result;
  } catch (e) {
    console.error(
      "[termco] pty_has_foreground_process failed for leaf",
      leafId,
      e,
    );
    return false;
  }
}

export function disposeSession(leafId: number): void {
  const s = sessions.get(leafId);
  if (!s) return;
  s.disposed = true;
  cancelHiddenRelease(s);
  for (const d of s.oscDisposers) {
    try {
      d();
    } catch {}
  }
  s.oscDisposers = [];
  disposeLeafSlot(leafId);
  s.hasSlot = false;
  s.snapshot = null;
  s.pty?.close();
  s.pty = null;
  s.pendingInput = "";
  sessions.delete(leafId);
  blockViewportListeners.delete(leafId);
  clearLeafBlockUi(leafId);
  disposeReadyWaiters(leafId);
}

export function useTerminalSession({
  leafId,
  workspace,
  container,
  visible,
  focused = true,
  initialCwd,
  blocks = false,
  onSearchReady,
  onExit,
  onCwd,
}: Options) {
  const cbRef = useRef({ onSearchReady, onExit, onCwd });
  cbRef.current = { onSearchReady, onExit, onCwd };

  // initialCwd seeds the first PTY spawn only. It must NOT be an effect dep:
  // OSC 7 updates the leaf cwd on every `cd`, and re-running the bind effect
  // would detach/rebind the renderer slot (disposing block markers) on each cd.
  const initialCwdRef = useRef(initialCwd);
  initialCwdRef.current = initialCwd;

  useEffect(() => {
    let cancelled = false;
    const s = ensureSession(leafId, workspace, initialCwdRef.current, blocks);
    s.ready.then(() => {
      if (cancelled || s.disposed) return;
      const node = container.current;
      if (!node) return;
      attachSession(leafId, node, {
        onSearchReady: (a) => cbRef.current.onSearchReady?.(a),
        onExit: (c) => cbRef.current.onExit?.(c),
        onCwd: (c) => cbRef.current.onCwd?.(c),
      });
      if (s.visibleNow && s.focusedNow) {
        if (!s.blocks) focusSlot(leafId);
        else if (s.blockMode === "prompt") {
          const inputFocus = s.inputFocus;
          if (inputFocus) setTimeout(inputFocus, 0);
        }
      }
    });
    return () => {
      cancelled = true;
      detachSession(leafId);
    };
  }, [leafId, container, blocks]);

  const [blockMode, setBlockMode] = useState<BlockMode>("prompt");
  useEffect(() => {
    if (!blocks) return;
    const s = ensureSession(leafId, workspace, initialCwdRef.current, blocks);
    setBlockMode(s.blockMode);
    const cb = () => setBlockMode(sessions.get(leafId)?.blockMode ?? "prompt");
    s.blockListeners.add(cb);
    return () => {
      s.blockListeners.delete(cb);
    };
  }, [leafId, blocks]);

  const fontSize = usePreferencesStore((p) => p.terminalFontSize);
  const zoomLevel = usePreferencesStore((p) => p.zoomLevel);
  useEffect(() => {
    applyFontSize(Math.max(4, Math.round(fontSize * zoomLevel)));
  }, [fontSize, zoomLevel]);

  const fontFamily = usePreferencesStore((p) => p.terminalFontFamily);
  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  const fontWeight = usePreferencesStore((p) => p.terminalFontWeight);
  useEffect(() => {
    applyFontWeight(fontWeight);
  }, [fontWeight]);

  const letterSpacing = usePreferencesStore((p) => p.terminalLetterSpacing);
  useEffect(() => {
    applyLetterSpacing(letterSpacing);
  }, [letterSpacing]);

  // terminalScrollback now sizes the engine buffer at slot creation
  // (ghostty's limit is fixed per core); changes apply to new slots.

  const cursorBlink = usePreferencesStore((p) => p.terminalCursorBlink);
  useEffect(() => {
    applyCursorBlink(cursorBlink);
  }, [cursorBlink]);

  const bgActive = usePreferencesStore(
    (p) => p.backgroundKind === "image" && !!p.backgroundImageId,
  );
  useEffect(() => {
    applyBackgroundActive(bgActive);
  }, [bgActive]);

  useEffect(() => {
    const s = sessions.get(leafId);
    if (!s) return;
    s.visibleNow = visible;
    s.focusedNow = focused;
    if (visible) {
      cancelHiddenRelease(s);
      if (s.container && !s.hasSlot) bindLeafToSlot(leafId, s);
      else if (s.hasSlot) refreshLeafSlot(leafId);
      setSlotFocused(leafId, focused);
      if (focused && !blocks) focusSlot(leafId);
    } else if (s.hasSlot) {
      // Always park first (keeps the grid live, pauses rendering); release
      // only after confirming nothing owns the terminal. Sync signals (OSC
      // 133, agent detect) short-circuit; the async foreground-process check
      // covers shells without integration.
      parkLeafSlot(leafId);
      if (!s.blocks && !isLeafAltScreen(leafId) && !leafBusy(s)) {
        void releaseIfIdle(leafId, s);
      }
    }
  }, [leafId, visible, focused, blocks]);

  const write = useCallback(
    (data: string) => {
      const s = sessions.get(leafId);
      if (!s || s.shellExited) return;
      if (s.pty) void s.pty.write(data);
      else queuePendingInput(s, data);
    },
    [leafId],
  );

  const focus = useCallback(() => focusSlot(leafId), [leafId]);

  const getBuffer = useCallback(
    (maxLines = 200): string | null => {
      const s = sessions.get(leafId);
      if (!s) return null;
      const slot = getLiveSlotForLeaf(leafId);
      if (slot) return slot.engine.getBufferTail(maxLines);
      if (!s.snapshot) return "";
      const plain = stripAnsi(s.snapshot);
      const lines = plain.split(/\r?\n/);
      const tail = lines.slice(-maxLines);
      while (tail.length && tail[tail.length - 1] === "") tail.pop();
      return tail.join("\n");
    },
    [leafId],
  );

  const getSelection = useCallback((): string | null => {
    const slot = getSlotForLeaf(leafId);
    return slot ? engineSelectionText(slot.engine.element) : null;
  }, [leafId]);

  const applyTheme = useCallback(() => {
    applyPoolTheme();
  }, []);

  const selectBlockAt = useCallback(
    (clientY: number) =>
      sessions.get(leafId)?.blockDecorations?.selectBlockAt(clientY),
    [leafId],
  );

  const readBlockId = useCallback(
    (id: string) =>
      sessions.get(leafId)?.blockDecorations?.readById(id) ?? null,
    [leafId],
  );

  const readBlockMeta = useCallback(
    (id: string): RenderableBlock | null =>
      sessions.get(leafId)?.blockDecorations?.renderableById(id) ?? null,
    [leafId],
  );

  // The workspace env this terminal is bound to — block widgets read fs/git
  // against THIS backend, not the global active env.
  const leafEnv = useCallback(
    (): WorkspaceEnv => sessions.get(leafId)?.env ?? { kind: "local" },
    [leafId],
  );

  const subscribeBlocks = useCallback(
    (cb: () => void) => {
      let set = blockViewportListeners.get(leafId);
      if (!set) {
        set = new Set();
        blockViewportListeners.set(leafId, set);
      }
      set.add(cb);
      return () => {
        const live = blockViewportListeners.get(leafId);
        live?.delete(cb);
        if (live && live.size === 0) blockViewportListeners.delete(leafId);
      };
    },
    [leafId],
  );

  const visibleBlocks = useCallback(
    (): VisibleBlocks =>
      sessions.get(leafId)?.blockDecorations?.visibleBlocks() ?? {
        blocks: [],
        sticky: null,
      },
    [leafId],
  );

  const searchBlock = useCallback(
    (id: string, query: string) =>
      sessions.get(leafId)?.blockDecorations?.searchBlock(id, query) ?? [],
    [leafId],
  );

  const revealMatch = useCallback(
    (m: BlockMatch) => sessions.get(leafId)?.blockDecorations?.revealMatch(m),
    [leafId],
  );

  const clearSearch = useCallback(
    () => sessions.get(leafId)?.blockDecorations?.clearSearch(),
    [leafId],
  );

  return useMemo(
    () => ({
      write,
      focus,
      getBuffer,
      getSelection,
      applyTheme,
      blockMode,
      selectBlockAt,
      readBlockId,
      readBlockMeta,
      leafEnv,
      subscribeBlocks,
      visibleBlocks,
      searchBlock,
      revealMatch,
      clearSearch,
    }),
    [
      write,
      focus,
      getBuffer,
      getSelection,
      applyTheme,
      blockMode,
      selectBlockAt,
      readBlockId,
      readBlockMeta,
      leafEnv,
      subscribeBlocks,
      visibleBlocks,
      searchBlock,
      revealMatch,
      clearSearch,
    ],
  );
}

export function terminalDebugStats() {
  const liveSessions = [...sessions.entries()].map(([leafId, s]) => ({
    leafId,
    pty: !!s.pty,
    visible: s.visibleNow,
    focused: s.focusedNow,
    hasSlot: s.hasSlot,
    ringBytes: s.dormantRing.byteLength(),
    snapshotLen: s.snapshot?.length ?? 0,
    shellExited: s.shellExited,
  }));
  const ringTotal = liveSessions.reduce((n, s) => n + s.ringBytes, 0);
  const snapshotTotal = liveSessions.reduce((n, s) => n + s.snapshotLen, 0);
  const slots = poolSlotStats();
  return {
    poolSize: poolSize(),
    idleSlots: slots.filter((s) => s.leafId === null).length,
    slots,
    sessionCount: liveSessions.length,
    sessions: liveSessions,
    ringBytesTotal: ringTotal,
    snapshotCharsTotal: snapshotTotal,
    domTerminals: document.querySelectorAll(".terminal-host").length,
    domRows: document.querySelectorAll(".terminal-host .term-row").length,
    jsHeapBytes:
      (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? null,
  };
}

if (typeof window !== "undefined") {
  (window as unknown as { __termcoTerm?: unknown }).__termcoTerm =
    terminalDebugStats;
}

/**
 * Renderer slot pool over the wterm TerminalEngine. A capped pool of
 * live terminals is recycled across many logical panes ("leaves"):
 * releasing a leaf retains its buffer in the slot for a cheap rebind;
 * stealing the slot serializes the buffer into a snapshot first.
 *
 * All engine specifics live behind lib/engine — this module owns slot
 * lifecycle, fit/resize debouncing, and per-slot input interception.
 */
import { resolveFontFamily } from "../../../fonts";
import { usePreferencesStore } from "../../../preferences";
import { applyTerminalCssTheme } from "../../../terminalTheme";
import { terminalRuntime } from "../../../runtime";
import { bufferLineText, TerminalEngine, warmEngineWasm } from "../engine";
import { attachLinkHandlers } from "../linkify";
import { serializeTerminal } from "../wtermSerialize";
import { shouldCursorBlink } from "../cursorBlink";
import { attachInputInterceptor } from "./inputInterceptor";
import type {
  AcquireParams,
  PoolSlotStat,
  ReleaseOutput,
  SerializeOutput,
  Slot,
  SlotAdapter,
} from "./types";

export type {
  AcquireParams,
  
  PoolSlotStat,
  ReleaseOutput,
  
  Slot,
  SlotAdapter,
} from "./types";

export const POOL_MAX_SIZE = 5;
const FIT_DEBOUNCE_MS = 8;
const PTY_RESIZE_DEBOUNCE_MS = 256;
const SNAPSHOT_SCROLLBACK_CAP = 5_000;
// ghostty's max_scrollback is byte-based; ~1.6KB covers a styled line.
const SCROLLBACK_BYTES_PER_LINE = 1_600;

const slots: Slot[] = [];
let recyclerEl: HTMLDivElement | null = null;
let adapter: SlotAdapter | null = null;

let windowActive =
  typeof document === "undefined" || (!document.hidden && document.hasFocus());
let windowActivityBound = false;
let cursorBlinkEnabled = false;

function bindWindowActivityListeners(): void {
  if (windowActivityBound || typeof window === "undefined") return;
  windowActivityBound = true;
  const sync = () => setWindowActive(!document.hidden && document.hasFocus());
  window.addEventListener("focus", sync);
  window.addEventListener("blur", sync);
  document.addEventListener("visibilitychange", sync);
}

function setWindowActive(active: boolean): void {
  if (windowActive === active) return;
  windowActive = active;
  for (const slot of slots) {
    if (slot.currentLeafId === null) continue;
    applyCursorBlinkOnSlot(
      slot,
      adapter?.isLeafFocused(slot.currentLeafId) ?? false,
    );
  }
}

export function configureRendererPool(a: SlotAdapter): void {
  adapter = a;
  bindWindowActivityListeners();
  warmEngineWasm();
}

export function poolSize(): number {
  return slots.length;
}

export function poolSlotStats(): PoolSlotStat[] {
  return slots.map((s) => ({
    id: s.id,
    leafId: s.currentLeafId,
    retainedLeafId: s.retainedLeafId,
    parked: s.parked,
    cols: s.engine.cols,
    rows: s.engine.rows,
    bufferLines: s.engine.scrollbackCount() + s.engine.rows,
  }));
}

// Bracketed paste decided by the engine, so an app that enabled it
// treats a dropped path as a real paste while a plain
// shell gets the literal text.
export function pasteIntoLeaf(leafId: number, text: string): boolean {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  if (!slot) return false;
  slot.engine.paste(text);
  return true;
}

function getRecycler(): HTMLDivElement {
  if (recyclerEl?.isConnected) return recyclerEl;
  const el = document.createElement("div");
  el.setAttribute("data-termco-recycler", "");
  el.style.cssText =
    "position:fixed;left:-99999px;top:-99999px;width:1024px;height:768px;overflow:hidden;pointer-events:none;contain:strict;";
  document.body.appendChild(el);
  recyclerEl = el;
  return el;
}

export function applyBackgroundActive(active: boolean): void {
  // No wterm equivalent of xterm's minimumContrastRatio; a CSS backdrop
  // under this class approximates legibility over background images.
  document.documentElement.classList.toggle("terminal-bg-image", active);
}

function scrollbackBytes(): number {
  const lines = usePreferencesStore.getState().terminalScrollback;
  const clamped = Math.max(1_000, Math.min(lines, 100_000));
  return clamped * SCROLLBACK_BYTES_PER_LINE;
}

function fontStyle() {
  const prefs = usePreferencesStore.getState();
  return {
    family: resolveFontFamily(prefs.terminalFontFamily),
    sizePx: Math.max(4, Math.round(prefs.terminalFontSize * prefs.zoomLevel)),
    weight: prefs.terminalFontWeight,
    letterSpacing: prefs.terminalLetterSpacing,
  };
}

function createSlot(): Slot {
  applyTerminalCssTheme();

  const host = document.createElement("div");
  host.className = "terminal-host";
  host.style.cssText = "width:100%;height:100%;";
  // Inline per-slot vars: the library's .wterm class (added to this same
  // element) declares its own defaults for --term-*, shadowing :root.
  applyTerminalCssTheme(host);
  host.setAttribute("data-termco-slot", String(slots.length));
  getRecycler().appendChild(host);

  const slot: Slot = {
    id: slots.length,
    engine: null as unknown as TerminalEngine,
    host,
    currentLeafId: null,
    retainedLeafId: null,
    parked: false,
    disposers: [],
    observer: null,
    fitTimer: null,
    ptyTimer: null,
    slotReapTimer: null,
    unhideRaf: null,
    lastCols: 0,
    lastRows: 0,
    lastW: 0,
    lastH: 0,
    lastUsedAt: 0,
  };

  const engine = new TerminalEngine(host, {
    cols: 80,
    rows: 24,
    scrollbackBytes: scrollbackBytes(),
    onData: (data) => {
      const leafId = slot.currentLeafId;
      if (leafId === null) return;
      adapter?.resolveLeaf(leafId)?.writeToPty(data);
    },
  });
  // Slot is frozen otherwise; engine must be attached post-construction
  // because its onData closure needs the slot object.
  (slot as { engine: TerminalEngine }).engine = engine;
  void engine.ready.then(() => {
    engine.applyFont(fontStyle());
    // Binding and ResizeObserver delivery can both happen while the async
    // engine is still loading. Those early fits intentionally return null,
    // but they also cache the container's final dimensions; without one
    // readiness fit, the grid stays at its bootstrap rows until the next
    // physical window resize changes those dimensions.
    if (slots.includes(slot)) refitSlot(slot);
    applyCursorBlinkOnSlot(
      slot,
      slot.currentLeafId !== null &&
        (adapter?.isLeafFocused(slot.currentLeafId) ?? false),
    );
    // Hover/click web links: hit-testing over the visible rows. Attached
    // to the engine element so overlay coordinates share its padding box.
    slot.disposers.push(
      attachLinkHandlers(engine.element, {
        pointToCell: (x, y) => engine.pointToCell(x, y),
        rowText: (row) => {
          const core = engine.core();
          const m = engine.cellMetrics();
          if (!core || !m) return "";
          const top = Math.min(
            Math.floor(engine.scrollTop / m.height),
            core.getScrollbackCount(),
          );
          return bufferLineText(core, top + row);
        },
        metrics: () => {
          const m = engine.cellMetrics();
          return m ? { cellWidth: m.width, rowHeight: m.height } : null;
        },
        openUrl: (url) => {
          terminalRuntime().desktop.openUrl(url).catch(console.error);
        },
      }),
    );
  });

  slot.disposers.push(
    attachInputInterceptor(slot, (s) =>
      s.currentLeafId !== null
        ? (adapter?.resolveLeaf(s.currentLeafId) ?? null)
        : null,
    ),
  );

  slot.lastCols = engine.cols;
  slot.lastRows = engine.rows;
  slots.push(slot);
  return slot;
}

type PickResult = { slot: Slot; previousLeafId: number | null };

function evictionScore(s: Slot): number {
  const leafId = s.currentLeafId;
  const visible = leafId !== null && (adapter?.isLeafVisible(leafId) ?? false);
  const busy = leafId !== null && (adapter?.isLeafBusy(leafId) ?? false);
  const blocks = leafId !== null && (adapter?.isLeafBlocks(leafId) ?? false);
  const focused = leafId !== null && (adapter?.isLeafFocused(leafId) ?? false);
  return (
    (visible ? 1000 : 0) +
    (s.engine.usingAltScreen() ? 100 : 0) +
    (busy ? 80 : 0) +
    (blocks ? 50 : 0) +
    (focused ? 10 : 0) +
    s.lastUsedAt / 1e12
  );
}

function pickSlotFor(leafId: number): PickResult {
  const retainedOwn = slots.find(
    (s) => s.currentLeafId === null && s.retainedLeafId === leafId,
  );
  if (retainedOwn) return { slot: retainedOwn, previousLeafId: null };

  const clean = slots.find(
    (s) => s.currentLeafId === null && s.retainedLeafId === null,
  );
  if (clean) return { slot: clean, previousLeafId: null };
  if (slots.length < POOL_MAX_SIZE)
    return { slot: createSlot(), previousLeafId: null };

  // Retained buffers are cheaper to lose than bound ones: serialize, no evict.
  let retained: Slot | null = null;
  for (const s of slots) {
    if (s.currentLeafId !== null) continue;
    if (!retained || s.lastUsedAt < retained.lastUsedAt) retained = s;
  }
  if (retained) return { slot: retained, previousLeafId: null };

  let best: Slot | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const s of slots) {
    if (s.currentLeafId === leafId) return { slot: s, previousLeafId: null };
    const score = evictionScore(s);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  const chosen = best as Slot;
  return { slot: chosen, previousLeafId: chosen.currentLeafId };
}

export function acquireSlot(params: AcquireParams): Slot {
  const existing = slots.find((s) => s.currentLeafId === params.leafId);
  if (existing) {
    rewireSlot(existing, params);
    return existing;
  }

  const pick = pickSlotFor(params.leafId);
  if (pick.previousLeafId !== null) {
    adapter?.evictLeaf(pick.previousLeafId);
  }
  if (
    pick.slot.currentLeafId !== null &&
    pick.slot.currentLeafId !== params.leafId
  ) {
    detachSlotFromLeaf(pick.slot, false);
  }
  if (
    pick.slot.retainedLeafId !== null &&
    pick.slot.retainedLeafId !== params.leafId
  ) {
    adapter?.storeSnapshot(pick.slot.retainedLeafId, serializeSlot(pick.slot));
    discardRetention(pick.slot);
  }
  bindSlot(pick.slot, params);
  return pick.slot;
}

function discardRetention(slot: Slot): void {
  slot.retainedLeafId = null;
}

function bindSlot(slot: Slot, p: AcquireParams): void {
  const fast = slot.retainedLeafId === p.leafId;
  slot.retainedLeafId = null;
  slot.currentLeafId = p.leafId;
  slot.lastUsedAt = performance.now();

  cancelPendingUnhide(slot);
  cancelSlotReap(slot);
  unparkSlotHost(slot);
  if (!fast) {
    slot.host.style.visibility = "hidden";
  }

  if (slot.host.parentNode !== p.container) {
    p.container.appendChild(slot.host);
  }

  slot.engine.setStdinEnabled(!p.shellExited);

  if (!fast) {
    slot.engine.reset();

    if (
      p.cols > 0 &&
      p.rows > 0 &&
      (slot.engine.cols !== p.cols || slot.engine.rows !== p.rows)
    ) {
      slot.engine.resize(p.cols, p.rows);
    }

    if (p.snapshot) {
      slot.engine.write(p.snapshot);
    }
    if (p.altScreen) {
      // TUI output is incremental cursor-positioned updates that can't be
      // replayed on top of a stale snapshot; the SIGWINCH kick below makes
      // the TUI redraw from scratch instead.
      p.drainRing(() => {});
    } else {
      p.drainRing((bytes) => slot.engine.write(bytes));
    }
    slot.engine.write("\x1b[?25h");
  } else {
    p.drainRing((bytes) => slot.engine.write(bytes));
  }

  setupResizeObserver(slot, p);
  fitSlotToContainer(slot);
  if (slot.lastCols !== p.cols || slot.lastRows !== p.rows) {
    // resizePty updates session.cols/rows + pty backend; no separate scope call.
    adapter?.resolveLeaf(p.leafId)?.resizePty(slot.lastCols, slot.lastRows);
  }

  applyCursorBlinkOnSlot(slot, adapter?.isLeafFocused(p.leafId) ?? false);

  if (!fast && p.altScreen && !p.shellExited) {
    adapter?.resolveLeaf(p.leafId)?.kickPty(slot.engine.cols, slot.engine.rows);
  }

  if (fast) {
    if (adapter?.isLeafFocused(p.leafId)) slot.engine.focus();
  } else {
    scheduleUnhide(slot);
  }
}

function fitSlotToContainer(slot: Slot): void {
  const container = slot.host.parentElement;
  if (!container) return;
  const grid = slot.engine.fit(container.clientWidth, container.clientHeight);
  if (grid) {
    slot.lastCols = grid.cols;
    slot.lastRows = grid.rows;
  } else {
    slot.lastCols = slot.engine.cols;
    slot.lastRows = slot.engine.rows;
  }
  slot.lastW = container.clientWidth;
  slot.lastH = container.clientHeight;
}

function scheduleUnhide(slot: Slot): void {
  // Double-rAF gives the engine one frame to paint the restored buffer
  // before the host is revealed, avoiding a white flash on rebind.
  slot.unhideRaf = requestAnimationFrame(() => {
    slot.unhideRaf = requestAnimationFrame(() => {
      slot.unhideRaf = null;
      slot.host.style.visibility = "";
      const leafId = slot.currentLeafId;
      if (leafId !== null && adapter?.isLeafFocused(leafId)) {
        slot.engine.focus();
      }
    });
  });
}

function cancelPendingUnhide(slot: Slot): void {
  if (slot.unhideRaf !== null) {
    cancelAnimationFrame(slot.unhideRaf);
    slot.unhideRaf = null;
  }
}

function rewireSlot(slot: Slot, p: AcquireParams): void {
  slot.lastUsedAt = performance.now();
  unparkSlotHost(slot);
  if (slot.host.parentNode !== p.container) {
    p.container.appendChild(slot.host);
  }
  setupResizeObserver(slot, p);
  const before = { cols: slot.engine.cols, rows: slot.engine.rows };
  fitSlotToContainer(slot);
  if (before.cols !== p.cols || before.rows !== p.rows) {
    adapter?.resolveLeaf(p.leafId)?.resizePty(slot.lastCols, slot.lastRows);
  }
}

function setupResizeObserver(slot: Slot, p: AcquireParams): void {
  slot.observer?.disconnect();
  if (slot.fitTimer) clearTimeout(slot.fitTimer);
  if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
  slot.fitTimer = null;
  slot.ptyTimer = null;

  const container = p.container;
  const flushPty = () => {
    slot.ptyTimer = null;
    if (slot.currentLeafId !== p.leafId) return;
    if (
      slot.engine.cols === slot.lastCols &&
      slot.engine.rows === slot.lastRows
    )
      return;
    slot.lastCols = slot.engine.cols;
    slot.lastRows = slot.engine.rows;
    adapter?.resolveLeaf(p.leafId)?.resizePty(slot.lastCols, slot.lastRows);
  };

  slot.observer = new ResizeObserver(() => {
    if (slot.parked) return;
    if (slot.fitTimer) clearTimeout(slot.fitTimer);
    slot.fitTimer = setTimeout(() => {
      slot.fitTimer = null;
      if (slot.currentLeafId !== p.leafId || slot.parked) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === slot.lastW && h === slot.lastH) return;
      slot.lastW = w;
      slot.lastH = h;
      slot.engine.fit(w, h);
      if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
      slot.ptyTimer = setTimeout(flushPty, PTY_RESIZE_DEBOUNCE_MS);
    }, FIT_DEBOUNCE_MS);
  });
  slot.observer.observe(container);
}

export function releaseSlot(leafId: number): ReleaseOutput | null {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  if (!slot) return null;
  detachSlotFromLeaf(slot, true);
  return { cols: slot.engine.cols, rows: slot.engine.rows };
}

function serializeSlot(slot: Slot): SerializeOutput {
  const core = slot.engine.core();
  const cap = Math.min(
    SNAPSHOT_SCROLLBACK_CAP,
    usePreferencesStore.getState().terminalScrollback,
  );
  const leafId = slot.currentLeafId ?? slot.retainedLeafId;
  const dec =
    leafId !== null ? adapter?.resolveLeaf(leafId)?.getDecModes() : null;
  const snap = core
    ? serializeTerminal(core, {
        maxLines: cap,
        modes: {
          bracketedPaste: core.bracketedPaste(),
          cursorKeysApp: core.cursorKeysApp(),
          mouseTracking: dec?.mouseTracking ?? "none",
          sgrMouse: dec?.sgrMouse ?? false,
        },
      })
    : null;
  return {
    snapshot: snap?.data ?? null,
    lines: snap?.lines ?? 0,
    cols: slot.engine.cols,
    rows: slot.engine.rows,
    altScreen: slot.engine.usingAltScreen(),
  };
}

function detachSlotFromLeaf(slot: Slot, retain: boolean): void {
  if (retain && slot.currentLeafId !== null) {
    slot.retainedLeafId = slot.currentLeafId;
    parkSlotHost(slot);
  } else {
    discardRetention(slot);
    unparkSlotHost(slot);
    if (slot.host.parentNode !== getRecycler()) {
      getRecycler().appendChild(slot.host);
    }
  }

  slot.observer?.disconnect();
  slot.observer = null;
  if (slot.fitTimer) clearTimeout(slot.fitTimer);
  if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
  slot.fitTimer = null;
  slot.ptyTimer = null;

  cancelPendingUnhide(slot);
  slot.host.style.visibility = "";

  slot.currentLeafId = null;
  slot.lastUsedAt = performance.now();
  scheduleSlotReap(slot);
}

// display:none skips layout for parked slots while the engine keeps
// parsing writes into the core (renders are cheap fixed-screen paints).
function parkSlotHost(slot: Slot): void {
  if (slot.parked) return;
  slot.parked = true;
  slot.host.style.display = "none";
}

function unparkSlotHost(slot: Slot): void {
  if (!slot.parked) return;
  slot.parked = false;
  slot.host.style.display = "";
}

function scheduleSlotReap(slot: Slot): void {
  cancelSlotReap(slot);
  slot.slotReapTimer = setTimeout(() => {
    slot.slotReapTimer = null;
    reapIdleSlot(slot);
  }, SLOT_REAP_GRACE_MS);
}

function cancelSlotReap(slot: Slot): void {
  if (slot.slotReapTimer !== null) {
    clearTimeout(slot.slotReapTimer);
    slot.slotReapTimer = null;
  }
}

function reapIdleSlot(slot: Slot): void {
  if (slot.currentLeafId !== null) return;
  const idle = slots.filter((s) => s.currentLeafId === null);
  if (idle.length <= IDLE_SLOTS_KEEP_WARM) return;
  idle.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const surplus = idle.slice(0, idle.length - IDLE_SLOTS_KEEP_WARM);
  if (!surplus.includes(slot)) return;
  if (slot.retainedLeafId !== null) {
    adapter?.storeSnapshot(slot.retainedLeafId, serializeSlot(slot));
  }
  disposeSlot(slot);
}

function disposeSlot(slot: Slot): void {
  cancelSlotReap(slot);
  cancelPendingUnhide(slot);
  if (slot.fitTimer) clearTimeout(slot.fitTimer);
  if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
  slot.fitTimer = null;
  slot.ptyTimer = null;
  slot.observer?.disconnect();
  slot.observer = null;
  for (const d of slot.disposers) {
    try {
      d();
    } catch {}
  }
  slot.disposers = [];
  try {
    slot.engine.destroy();
  } catch (e) {
    console.warn("[termco] slot dispose failed:", e);
  }
  slot.host.remove();
  const i = slots.indexOf(slot);
  if (i >= 0) slots.splice(i, 1);
}

const SLOT_REAP_GRACE_MS = 45_000;
const IDLE_SLOTS_KEEP_WARM = 1;

// Parked and retained slots can't be measured (display:none); poison lastW
// so the refit happens on unpark/rebind instead.
function refitSlot(slot: Slot): void {
  if (slot.parked || slot.currentLeafId === null) {
    slot.lastW = -1;
    return;
  }
  fitSlotToContainer(slot);
  adapter
    ?.resolveLeaf(slot.currentLeafId)
    ?.resizePty(slot.engine.cols, slot.engine.rows);
}

function applyFontToSlots(): void {
  const style = fontStyle();
  for (const slot of slots) {
    slot.engine.applyFont(style);
    refitSlot(slot);
  }
}

export function applyFontSize(_size: number): void {
  applyFontToSlots();
}

export function applyLetterSpacing(_spacing: number): void {
  applyFontToSlots();
}

export function applyFontFamily(_family: string): void {
  applyFontToSlots();
}

export function applyFontWeight(_weight: string): void {
  applyFontToSlots();
}

export function applyTheme(): void {
  applyTerminalCssTheme();
  for (const slot of slots) applyTerminalCssTheme(slot.host);
}

export function focusSlot(leafId: number): void {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  slot?.engine.focus();
}

export function setSlotFocused(leafId: number, focused: boolean): void {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  if (!slot) return;
  applyCursorBlinkOnSlot(slot, focused);
}

export function applyCursorBlink(enabled: boolean): void {
  cursorBlinkEnabled = enabled;
  for (const slot of slots) {
    if (slot.currentLeafId === null) continue;
    applyCursorBlinkOnSlot(
      slot,
      adapter?.isLeafFocused(slot.currentLeafId) ?? false,
    );
  }
}

function applyCursorBlinkOnSlot(slot: Slot, focused: boolean): void {
  const desired = shouldCursorBlink(cursorBlinkEnabled, windowActive, focused);
  slot.engine.element.classList.toggle("cursor-blink", desired);
}

export function getSlotForLeaf(leafId: number): Slot | null {
  return slots.find((s) => s.currentLeafId === leafId) ?? null;
}

export function isLeafAltScreen(leafId: number): boolean {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  return slot ? slot.engine.usingAltScreen() : false;
}

export function parkLeafSlot(leafId: number): void {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  if (!slot) return;
  parkSlotHost(slot);
}

export function refreshLeafSlot(leafId: number): void {
  const slot = slots.find((s) => s.currentLeafId === leafId);
  if (!slot) return;
  unparkSlotHost(slot);
  // While parked (display:none) the host has zero height, so any render in
  // that window saw an empty visible area — for a blocks slot that must not
  // tear anything down, and either way nothing re-renders on its own when
  // the size didn't change. Force a fresh layout + render now that the host
  // is measurable again.
  slot.engine.setBlocksDirty();
  // The observer skips parked slots; catch up on container resizes here.
  const container = slot.host.parentElement;
  if (
    container &&
    (container.clientWidth !== slot.lastW ||
      container.clientHeight !== slot.lastH)
  ) {
    const before = { cols: slot.engine.cols, rows: slot.engine.rows };
    fitSlotToContainer(slot);
    if (slot.engine.cols !== before.cols || slot.engine.rows !== before.rows) {
      adapter?.resolveLeaf(leafId)?.resizePty(slot.lastCols, slot.lastRows);
    }
  }
}

export function disposeLeafSlot(leafId: number): void {
  const slot = slots.find(
    (s) => s.currentLeafId === leafId || s.retainedLeafId === leafId,
  );
  if (slot) disposeSlot(slot);
}

export function discardRetainedSlot(leafId: number): void {
  const slot = slots.find(
    (s) => s.currentLeafId === null && s.retainedLeafId === leafId,
  );
  if (!slot) return;
  discardRetention(slot);
  slot.engine.reset();
}

export function getLiveSlotForLeaf(leafId: number): Slot | null {
  return (
    slots.find(
      (s) => s.currentLeafId === leafId || s.retainedLeafId === leafId,
    ) ?? null
  );
}

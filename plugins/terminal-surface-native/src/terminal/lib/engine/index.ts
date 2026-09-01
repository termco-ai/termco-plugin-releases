/**
 * TerminalEngine — the app's sole gateway to @wterm. Everything above
 * (renderer pool, session manager, blocks, search) talks to this
 * facade so the engine library stays swappable and its quirks stay
 * contained here.
 *
 * Creation is synchronous while the underlying GhosttyCore.load() and
 * WTerm.init() are async: mutating calls made before readiness queue
 * in order and flush on ready, so the pool's synchronous slot
 * lifecycle never has to await an engine.
 */
import { GhosttyCore } from "@wterm/ghostty";
import { WTerm, type BlocksOptions } from "@wterm/dom";
import type { TerminalCore } from "@wterm/core";
import { computeGrid, measureCellMetrics, type CellMetrics } from "./fit";
import { bufferTail, viewportHasGlyphs } from "./lineReader";
import { withPaletteMapping } from "./themedCore";

export type { CellMetrics } from "./fit";
export {
  bufferLineCount,
  bufferLineText,
  
  
} from "./lineReader";
export {
  clearEngineSelection,
  engineHasSelection,
  engineSelectionText,
} from "./selection";
;
export {
  encodeMouseEvent,
  wheelFallbackSequence,
  type MouseEventKind,
  
} from "./mouseEncoder";
;

export type EngineOptions = {
  cols: number;
  rows: number;
  /** ghostty max_scrollback in BYTES (~1.5KB/line; 16MB ≈ 10k lines). */
  scrollbackBytes: number;
  /** Keyboard input and core query responses, destined for the PTY. */
  onData: (data: string) => void;
};

/** One shared wasm fetch across all engines (browser-cached anyway). */
let warmed = false;

export function warmEngineWasm(): void {
  if (warmed) return;
  warmed = true;
  void GhosttyCore.load().catch(() => {
    warmed = false;
  });
}

export class TerminalEngine {
  readonly host: HTMLElement;
  readonly ready: Promise<void>;

  private term: WTerm | null = null;
  private coreRef: TerminalCore | null = null;
  private pending: Array<() => void> = [];
  private destroyed = false;
  private stdinEnabled = true;
  private metrics: CellMetrics | null = null;
  private targetCols = 0;
  private targetRows = 0;
  private blocksOpts: BlocksOptions | null = null;
  private fitInsetX = 0;
  private readonly onData: (data: string) => void;

  constructor(host: HTMLElement, opts: EngineOptions) {
    this.host = host;
    this.targetCols = opts.cols;
    this.targetRows = opts.rows;
    this.onData = opts.onData;

    this.ready = (async () => {
      const rawCore = await GhosttyCore.load({
        scrollbackLimit: opts.scrollbackBytes,
      });
      if (this.destroyed) return;
      const core = withPaletteMapping(rawCore);
      const term = new WTerm(host, {
        cols: this.targetCols,
        rows: this.targetRows,
        core,
        autoResize: false,
        cursorBlink: false,
        blocks: this.blocksOpts ?? undefined,
        onData: (data) => {
          if (this.stdinEnabled) this.onData(data);
        },
      });
      await term.init();
      if (this.destroyed) {
        term.destroy();
        return;
      }
      // The pool owns layout; undo WTerm's fixed-height lock.
      host.style.height = "100%";
      this.term = term;
      this.coreRef = core;
      const queued = this.pending;
      this.pending = [];
      for (const fn of queued) fn();
    })();
  }

  get cols(): number {
    return this.targetCols;
  }

  get rows(): number {
    return this.targetRows;
  }

  get isReady(): boolean {
    return this.term !== null;
  }

  /** The wterm root element (valid once ready; host before that). */
  get element(): HTMLElement {
    return this.term?.element ?? this.host;
  }

  core(): TerminalCore | null {
    return this.coreRef;
  }

  private run(fn: () => void): void {
    if (this.destroyed) return;
    if (this.term) fn();
    else this.pending.push(fn);
  }

  write(data: string | Uint8Array): void {
    // Queue a copy: PTY chunk buffers may be reused by the transport.
    const payload = typeof data === "string" ? data : data.slice();
    this.run(() => {
      this.term?.write(payload);
      this.drainResponses();
    });
  }

  /**
   * Core-generated replies (DSR answered by wterm's own paths) surface
   * via polling; wterm only drains them on render frames, which is too
   * slow for query round-trips.
   */
  private drainResponses(): void {
    const core = this.coreRef;
    if (!core) return;
    for (;;) {
      const resp = core.getResponse();
      if (resp === null) return;
      this.onData(resp);
    }
  }

  resize(cols: number, rows: number): void {
    this.targetCols = cols;
    this.targetRows = rows;
    this.run(() => this.term?.resize(cols, rows));
  }

  /** Measure the container and resize to fit. Null before layout. */
  fit(
    contentWidth: number,
    contentHeight: number,
  ): { cols: number; rows: number } | null {
    if (!this.term) return null;
    this.metrics ??= measureCellMetrics(this.term.element);
    if (!this.metrics) return null;
    const grid = computeGrid(
      Math.max(0, contentWidth - this.fitInsetX),
      contentHeight,
      this.metrics,
    );
    if (grid.cols !== this.targetCols || grid.rows !== this.targetRows) {
      this.resize(grid.cols, grid.rows);
    }
    return grid;
  }

  /** Font changed: drop cached cell metrics so the next fit re-measures. */
  invalidateMetrics(): void {
    this.metrics = null;
  }

  focus(): void {
    this.run(() => this.term?.focus());
  }

  setStdinEnabled(enabled: boolean): void {
    this.stdinEnabled = enabled;
    const textarea = this.inputTextarea();
    if (textarea) textarea.disabled = !enabled;
  }

  /** wterm's hidden input textarea (blocks mode redirects its focus). */
  inputTextarea(): HTMLTextAreaElement | null {
    return this.term?.element.querySelector("textarea") ?? null;
  }

  /**
   * Paste text as the terminal user: sanitized, bracketed when the
   * PTY app enabled bracketed paste, delivered to the PTY (never
   * written into the core).
   */
  paste(text: string): void {
    this.run(() => {
      const safe = text.replace(/\x1b/g, "").replace(/\r\n|\n/g, "\r");
      const bracketed = this.coreRef?.bracketedPaste()
        ? `\x1b[200~${safe}\x1b[201~`
        : safe;
      this.onData(bracketed);
    });
  }

  /** ⌘K-style clear: wipes screen and scrollback. */
  clear(): void {
    this.write("\x1b[H\x1b[2J\x1b[3J");
  }

  /** Full reset for slot recycling. */
  reset(): void {
    this.write("\x1bc\x1b[3J");
  }

  /**
   * Enable/disable the blocks rendering mode (real HTML block containers
   * wrapping command output). `insetX` narrows the fitted grid so rows fit
   * inside the containers' horizontal chrome.
   */
  setBlocks(opts: BlocksOptions | null, insetX = 0): void {
    this.blocksOpts = opts;
    this.fitInsetX = opts ? insetX : 0;
    this.run(() => this.term?.setBlocks(this.blocksOpts));
  }

  /** Block ranges or block UI state changed: rebuild the blocks layout. */
  setBlocksDirty(): void {
    this.run(() => this.term?.setBlocksDirty());
  }

  /** Virtual pixel position of a buffer line (blocks-layout aware). */
  lineToPx(line: number): number {
    return this.term?.lineToPx(line) ?? line * 17;
  }

  usingAltScreen(): boolean {
    return this.coreRef?.usingAltScreen() ?? false;
  }

  cursorKeysApp(): boolean {
    return this.coreRef?.cursorKeysApp() ?? false;
  }

  scrollbackCount(): number {
    return this.coreRef?.getScrollbackCount() ?? 0;
  }

  getBufferTail(maxLines = 200): string {
    return this.coreRef ? bufferTail(this.coreRef, maxLines) : "";
  }

  viewportHasGlyphs(): boolean {
    return this.coreRef ? viewportHasGlyphs(this.coreRef) : false;
  }

  /** Virtual scroll position in pixels (synthetic scrollbar strip). */
  get scrollTop(): number {
    return this.term?.scrollTop ?? 0;
  }

  set scrollTop(px: number) {
    this.run(() => {
      if (this.term) this.term.scrollTop = px;
    });
  }

  get scrollHeight(): number {
    return this.term?.scrollHeight ?? 0;
  }

  get viewportHeight(): number {
    return this.term?.viewportHeight ?? 0;
  }

  applyFont(style: {
    family: string;
    sizePx: number;
    weight: string;
    letterSpacing: number;
  }): void {
    this.run(() => {
      const el = this.term?.element;
      if (!el) return;
      el.style.fontFamily = style.family;
      el.style.fontSize = `${style.sizePx}px`;
      el.style.fontWeight = style.weight;
      el.style.letterSpacing = `${style.letterSpacing}px`;
      this.invalidateMetrics();
    });
  }

  /** Measured cell metrics (null before first layout). */
  cellMetrics(): CellMetrics | null {
    const el = this.term?.element;
    if (!el) return null;
    this.metrics ??= measureCellMetrics(el);
    return this.metrics;
  }

  /** Grid cell under a viewport point, for mouse reporting. */
  pointToCell(
    clientX: number,
    clientY: number,
  ): { col: number; row: number } | null {
    const el = this.term?.element;
    if (!el) return null;
    this.metrics ??= measureCellMetrics(el);
    if (!this.metrics) return null;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const x = clientX - rect.left - (Number.parseFloat(style.paddingLeft) || 0);
    const y = clientY - rect.top - (Number.parseFloat(style.paddingTop) || 0);
    const col = Math.floor(x / this.metrics.width);
    const row = Math.floor(y / this.metrics.height);
    if (
      col < 0 ||
      row < 0 ||
      col >= this.targetCols ||
      row >= this.targetRows
    ) {
      return null;
    }
    return { col, row };
  }

  destroy(): void {
    this.destroyed = true;
    this.pending = [];
    this.term?.destroy();
    this.term = null;
    this.coreRef = null;
  }
}

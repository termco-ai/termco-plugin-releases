/**
 * Command "blocks" tracking and geometry over the wterm engine.
 * Session-owned: OSC 133 markers arrive from the session's stream
 * parser (with exact buffer-line context), block boundaries live as
 * TerminalLineSpace anchors that survive trims and slot recycling, and
 * pixel geometry derives from the engine's virtual scroll position and
 * row height. `attach()` binds a renderer slot for geometry and
 * viewport events; while detached (dormant leaf), tracking continues
 * and geometry queries return empty.
 */
import {
  clearEngineSelection,
  engineHasSelection,
  type TerminalEngine,
} from "../../../lib/engine";
import type { TerminalLineSpace } from "../../../lib/lineSpace";
import {
  createShellIntegrationState,
  registerCwdStreamHandler,
} from "../../../lib/osc-handlers";
import type { PtyStreamParser } from "../../../lib/streamParser";
import { blockIndexAt, computeRange, type LineRange } from "../blockRange";
import {
  type BlockMode,
  initialModeState,
  type ModeState,
  modeOf,
  reduceMode,
} from "../modeMachine";
import { readRangeText } from "../readBlock";
import type { BlockMeta } from "../types";
import type {
  BlockContext,
  BlockDecorationsOptions,
  BlockMatch,
  Entry,
  LiveBlock,
  PositionedBlock,
  RulerMark,
  VisibleBlocks,
} from "./types";

export type {
  BlockContext,
  BlockDecorationsOptions,
  BlockMatch,
  
  RulerMark,
  VisibleBlocks,
} from "./types";

const MAX_BLOCKS = 1000;
const DEFAULT_ROW_HEIGHT = 17;
/**
 * Rows of shell preamble (blank prompt-spacing line + command echo) above
 * the 133;C output line that belong to a block visually. Between blocks
 * the whole gap is swallowed; this caps the first block's reach so a
 * login banner stays outside the card.
 */
const PREAMBLE_ROWS = 2;

/** One finished command, shaped for the wterm blocks-mode provider. */
export type RenderableBlock = {
  id: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number;
  /** First covered buffer line (includes swallowed prompt/echo rows). */
  startLine: number;
  /** Last content line (blank tail below the 133;D anchor trimmed). */
  endLine: number;
  /** Leading covered rows that are preamble, not output. */
  hiddenLeadingLines: number;
};

export type BlockDecorationsDeps = {
  parser: PtyStreamParser;
  lineSpace: TerminalLineSpace;
};

export class BlockDecorations {
  private readonly entries: Entry[] = [];
  private live: LiveBlock | null = null;
  private cwd = "";
  private pendingCommand: string | null = null;
  private idSeq = 0;
  private selectedId: string | null = null;
  private searchEl: HTMLDivElement | null = null;
  private mode: ModeState = initialModeState();
  private lastMode: BlockMode = modeOf(initialModeState());
  private readonly shellState = createShellIntegrationState();
  private readonly disposers: (() => void)[] = [];
  private readonly onCwd?: (cwd: string) => void;
  private readonly onMode?: (mode: BlockMode) => void;
  private readonly onViewport?: () => void;
  private viewportRaf: number | null = null;

  private readonly lineSpace: TerminalLineSpace;
  private engine: TerminalEngine | null = null;
  private detachSlot: (() => void) | null = null;

  constructor(deps: BlockDecorationsDeps, opts?: BlockDecorationsOptions) {
    this.lineSpace = deps.lineSpace;
    this.onCwd = opts?.onCwd;
    this.onMode = opts?.onMode;
    this.onViewport = opts?.onViewport;

    const osc133 = deps.parser.registerOscHandler(133, (data, ctx) => {
      this.onOsc133(data, this.lineSpace.toAbsolute(ctx.bufferLine));
      return true;
    });
    const cwd = registerCwdStreamHandler(
      deps.parser,
      (c) => {
        this.cwd = c;
        this.onCwd?.(c);
      },
      this.shellState,
    );
    const afterWrite = deps.parser.onAfterWrite(() => {
      this.syncAlt();
      this.scheduleViewport();
    });
    // Scrollback erase (CSI 3 J — `clear`, ⌘K) invalidates every anchor
    // above the grid: finished blocks point at wiped content, and the
    // command that did the wiping shouldn't leave a card either.
    const erase = deps.parser.onScrollbackErase(() => {
      for (const e of this.entries) this.disposeEntry(e);
      this.entries.length = 0;
      if (this.live) this.live.wiped = true;
      this.scheduleViewport();
    });
    this.disposers.push(osc133, cwd, afterWrite, erase);
  }

  /** Bind a renderer slot: geometry + scroll events come from its engine. */
  attach(engine: TerminalEngine): void {
    this.detach();
    this.engine = engine;
    // Scroll events don't bubble but do propagate in the capture phase;
    // the synthetic scrollbar strip lives inside the engine element.
    const onScroll = () => this.scheduleViewport();
    engine.element.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    this.detachSlot = () => {
      engine.element.removeEventListener("scroll", onScroll, {
        capture: true,
      });
    };
    this.syncAlt();
    this.scheduleViewport();
  }

  detach(): void {
    this.detachSlot?.();
    this.detachSlot = null;
    this.engine = null;
  }

  private scheduleViewport(): void {
    if (this.viewportRaf != null) return;
    this.viewportRaf = requestAnimationFrame(() => {
      this.viewportRaf = null;
      this.onViewport?.();
    });
  }

  syncAlt(): void {
    const alt = this.engine?.usingAltScreen() ?? false;
    if (alt === this.mode.altScreen) return;
    this.mode = reduceMode(this.mode, { type: "altScreen", active: alt });
    if (alt && this.live) this.live.usedAlt = true;
    this.emitMode();
    this.scheduleViewport();
  }

  private rowHeight(): number {
    const el = this.engine?.element;
    if (!el) return DEFAULT_ROW_HEIGHT;
    const v = Number.parseFloat(
      getComputedStyle(el).getPropertyValue("--term-row-height"),
    );
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_ROW_HEIGHT;
  }

  /** First visible buffer line, from the engine's virtual scroll. */
  private viewTopLine(): number {
    const engine = this.engine;
    if (!engine) return 0;
    const core = engine.core();
    const sb = core?.getScrollbackCount() ?? 0;
    const top = Math.floor(engine.scrollTop / this.rowHeight());
    return Math.min(top, sb);
  }

  getBlocks(): BlockMeta[] {
    const out: BlockMeta[] = [];
    for (const e of this.entries) {
      const r = this.rangeOf(e);
      if (r) out.push(this.toMeta(e, r));
    }
    return out;
  }

  blockAt(line: number): BlockMeta | null {
    const ranges = this.entries.map((e) => this.rangeOf(e));
    const i = blockIndexAt(ranges, line);
    if (i < 0) return null;
    const r = ranges[i];
    return r ? this.toMeta(this.entries[i], r) : null;
  }

  readById(id: string): BlockContext | null {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return null;
    const r = this.rangeOf(e);
    const core = this.engine?.core();
    return {
      command: e.command,
      cwd: e.cwd,
      exitCode: e.exitCode,
      output: r && core ? readRangeText(core, r.start, r.end) : "",
    };
  }

  /** Which block/query the last searchBlock ran for (reveal context). */
  private lastSearch: { id: string; query: string } | null = null;

  searchBlock(id: string, query: string): BlockMatch[] {
    const e = this.entries.find((x) => x.id === id);
    if (!e || !query) return [];
    const r = this.rangeOf(e);
    const core = this.engine?.core();
    if (!r || !core) return [];
    const q = query.toLowerCase();
    this.lastSearch = { id, query: q };
    const out: BlockMatch[] = [];
    // The command echo is visible text in the card (the synthesized
    // header line) — it belongs to the search domain.
    const cmd = e.command.toLowerCase();
    let cFrom = 0;
    while (out.length < 50) {
      const idx = cmd.indexOf(q, cFrom);
      if (idx < 0) break;
      out.push({ line: r.start, col: idx, len: query.length, kind: "command" });
      cFrom = idx + Math.max(1, query.length);
    }
    let ordinal = 0;
    for (let i = r.start; i <= r.end && out.length < 500; i++) {
      const lower = readRangeText(core, i, i).toLowerCase();
      let from = 0;
      while (out.length < 500) {
        const idx = lower.indexOf(q, from);
        if (idx < 0) break;
        out.push({
          line: i,
          col: idx,
          len: query.length,
          kind: "output",
          ordinal: ordinal++,
        });
        from = idx + Math.max(1, query.length);
      }
    }
    return out;
  }

  revealMatch(m: BlockMatch): void {
    this.clearSearch();
    const engine = this.engine;
    if (!engine) return;
    const rh = this.rowHeight();
    const rows = engine.rows;
    // lineToPx is blocks-layout aware (headers/gaps offset lines from the
    // uniform line × rowHeight grid). Command matches live in the header
    // just above the first output line — scroll a little higher.
    const linePx = engine.lineToPx(m.line);
    engine.scrollTop =
      m.kind === "command"
        ? Math.max(0, linePx - 6 * rh)
        : Math.max(0, linePx - Math.floor(rows / 2) * rh);

    // Highlight overlay positioned on the next frame, once the fixed
    // screen has repainted for the new scroll position. Placement prefers
    // real layout (a Range over the visible text — header echo, row, or
    // widget body); the computed-math path is the fallback when layout
    // yields nothing (jsdom, unmounted block).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const host = engine.element;
        const hostRect = host.getBoundingClientRect();
        const el = document.createElement("div");
        el.className = "bt-match";
        el.style.cssText = "position:absolute;pointer-events:none;";

        const placeRect = (rect: DOMRect | undefined): boolean => {
          if (!rect || rect.width <= 0 || rect.height <= 0) return false;
          el.style.top = `${rect.top - hostRect.top}px`;
          el.style.left = `${rect.left - hostRect.left}px`;
          el.style.width = `${rect.width}px`;
          el.style.height = `${rect.height}px`;
          return true;
        };
        const blockId = this.lastSearch?.id;
        const blockEl = blockId
          ? host.querySelector(
              `.term-block[data-block-id="${CSS.escape(blockId)}"]`,
            )
          : null;

        let placed = false;
        if (m.kind === "command") {
          const echo = blockEl?.querySelector(".tb-echo-cmd") ?? null;
          placed = placeRect(charSpanRect(echo, m.col, m.len));
        } else {
          const rowEl = host.querySelector(`.term-row[data-line="${m.line}"]`);
          placed = placeRect(charSpanRect(rowEl, m.col, m.len));
          if (!placed && this.lastSearch) {
            // Rows hidden behind a widget (ls chips, git rows): highlight
            // the same-rank occurrence in the widget's visible text so
            // next/previous hop between chips/rows.
            const body = blockEl?.querySelector(".term-block-body") ?? null;
            placed = placeRect(
              occurrenceRect(body, this.lastSearch.query, m.ordinal ?? 0),
            );
          }
        }

        if (!placed) {
          // Computed fallback: line/cell math (also the jsdom path).
          const cell = engine.cellMetrics();
          if (!cell) return;
          const grid = host.querySelector(".term-grid");
          const padX = grid
            ? Number.parseFloat(
                getComputedStyle(grid).getPropertyValue("--wtb-pad-x"),
              ) || 0
            : 0;
          const insetX = padX > 0 ? padX + 1 : 0;
          el.style.top = `${engine.lineToPx(m.line) - engine.scrollTop}px`;
          el.style.left = `${insetX + m.col * cell.width}px`;
          el.style.width = `${m.len * cell.width}px`;
          el.style.height = `${rh}px`;
        }
        host.appendChild(el);
        this.searchEl = el;
      });
    });
  }

  clearSearch(): void {
    this.searchEl?.remove();
    this.searchEl = null;
  }

  commandLines(): number[] {
    const lines: number[] = [];
    for (const e of this.entries) {
      if (!e.startMarker.isDisposed && e.startMarker.line >= 0)
        lines.push(e.startMarker.line);
    }
    return lines;
  }

  hasAnyBlock(): boolean {
    return this.entries.length > 0 || this.live !== null;
  }

  rulerMarks(): RulerMark[] {
    const core = this.engine?.core();
    if (!core) return [];
    const total = core.getScrollbackCount() + core.getRows();
    if (total <= 0) return [];
    const out: RulerMark[] = [];
    for (const e of this.entries) {
      const r = this.rangeOf(e);
      if (!r) continue;
      out.push({
        frac: r.end / total,
        ok: e.exitCode === 0 || e.exitCode === null,
      });
    }
    return out;
  }

  /** Cache of trimmed end offsets (relative to range start), content-stable. */
  private readonly trimCache = new Map<string, number>();

  /**
   * Block ranges for the wterm blocks renderer, in current buffer-line
   * space. Called on every render frame — trims are cached per entry.
   * Finished blocks swallow the prompt/echo rows above their output (the
   * app's header replaces them); the running command stays uncovered so
   * its output renders as the bare live tail.
   */
  renderRanges(): RenderableBlock[] {
    const core = this.engine?.core();
    if (!core) return [];
    const out: RenderableBlock[] = [];
    let prevEnd = -1;
    // The line the cursor sits on is live (the prompt, or streaming
    // output) and must stay bare. A 133;D anchor can land exactly where
    // the next prompt is drawn (e.g. right after `clear`), which would
    // otherwise pull the prompt row into the finished block.
    const cursorAbs = core.getScrollbackCount() + core.getCursor().row;

    for (const e of this.entries) {
      const r = this.rangeOf(e);
      if (!r) continue;

      let endLine = r.end;
      // Cached offset: -1 marks "output entirely blank" (e.g. cd) — the
      // card collapses to its header instead of showing an empty row.
      let cachedOffset = this.trimCache.get(e.id);
      if (cachedOffset === undefined) {
        const floor = Math.max(r.start, endLine - 512);
        while (
          endLine > floor &&
          readRangeText(core, endLine, endLine).trim() === ""
        ) {
          endLine--;
        }
        const allBlank =
          endLine === r.start &&
          readRangeText(core, endLine, endLine).trim() === "";
        cachedOffset = allBlank ? -1 : endLine - r.start;
        this.trimCache.set(e.id, cachedOffset);
      }
      const noOutput = cachedOffset < 0;
      endLine = Math.min(
        r.start + Math.max(cachedOffset, 0),
        r.end,
        cursorAbs - 1,
      );

      // Swallow the whole gap up to the previous block (blank prompt
      // spacing + echo rows belong to this command) so cards keep the
      // uniform layout gap; only the first block is capped, keeping a
      // login banner outside the card.
      const startLine =
        prevEnd >= 0
          ? Math.min(prevEnd + 1, r.start)
          : Math.max(r.start - PREAMBLE_ROWS, 0);
      if (endLine < startLine) continue;

      out.push({
        id: e.id,
        command: e.command,
        cwd: e.cwd,
        exitCode: e.exitCode,
        startedAt: e.startedAt,
        finishedAt: e.finishedAt,
        startLine,
        endLine,
        hiddenLeadingLines: noOutput
          ? endLine - startLine + 1
          : r.start - startLine,
      });
      prevEnd = endLine;
    }
    return out;
  }

  /** Meta + range for one finished block (null while running/unknown). */
  renderableById(id: string): RenderableBlock | null {
    return this.renderRanges().find((b) => b.id === id) ?? null;
  }

  visibleBlocks(): VisibleBlocks {
    const engine = this.engine;
    // No block chrome over a full-screen TUI (vim/htop) — it owns the screen.
    if (!engine || this.mode.altScreen) return { blocks: [], sticky: null };
    const rh = this.rowHeight();
    if (engine.rows === 0) return { blocks: [], sticky: null };

    const vpTop = this.viewTopLine();
    const vpBottom = vpTop + engine.rows;
    const core = engine.core();

    const out: PositionedBlock[] = [];
    let sticky: PositionedBlock | null = null;

    const consider = (
      meta: Omit<PositionedBlock, "top" | "bottom" | "ok" | "headerTop">,
      startLine: number,
      endLineRaw: number,
    ) => {
      if (endLineRaw < vpTop || startLine > vpBottom) return;
      // The end anchor rides the line the shell's 133;D landed on, which can
      // sit far below the output (prompt spacing, or a fresh session whose
      // anchor lands at the bottom of the initial grid). Trim the blank tail
      // so block chrome hugs the content instead of stretching down the pane.
      // Bounded only as a runaway guard — it must reach the content even when
      // the anchor is a whole viewport below it.
      let endLine = endLineRaw;
      if (!meta.running && core) {
        const floor = Math.max(startLine, endLine - 512);
        while (
          endLine > floor &&
          readRangeText(core, endLine, endLine).trim() === ""
        ) {
          endLine--;
        }
      }
      const ok = meta.exitCode === 0 || meta.exitCode === null;
      const top = (startLine - vpTop) * rh;
      const bottom = (endLine - vpTop + 1) * rh;
      const pb: PositionedBlock = {
        ...meta,
        ok,
        top,
        bottom,
        // The C marker lands on the first output line, so the command echo is
        // one row above `top` and the blank header gap is two rows above.
        headerTop: top - 1.9 * rh,
      };
      out.push(pb);
      if (startLine < vpTop && endLine >= vpTop) sticky = pb;
    };

    // entries are chronological, so binary search beats a full scan per frame
    for (
      let i = this.firstIndexEndingAtOrAfter(vpTop);
      i < this.entries.length;
      i++
    ) {
      const e = this.entries[i];
      const r = this.rangeOf(e);
      if (!r) continue;
      if (r.start > vpBottom) break;
      consider(
        {
          id: e.id,
          command: e.command,
          cwd: e.cwd,
          exitCode: e.exitCode,
          running: false,
          startedAt: e.startedAt,
          finishedAt: e.finishedAt,
        },
        r.start,
        r.end,
      );
    }

    const lb = this.live;
    if (lb && !lb.startMarker.isDisposed && lb.startMarker.line >= 0 && core) {
      const start = lb.startMarker.line;
      const end = Math.max(
        start,
        core.getScrollbackCount() + core.getCursor().row,
      );
      consider(
        {
          id: lb.id,
          command: lb.command,
          cwd: lb.cwd,
          exitCode: null,
          running: true,
          startedAt: lb.startedAt,
          finishedAt: 0,
        },
        start,
        end,
      );
    }

    return { blocks: out, sticky };
  }

  selectBlockAt(clientY: number): void {
    const engine = this.engine;
    if (!engine) return;
    const rect = engine.element.getBoundingClientRect();
    const rh = this.rowHeight();
    const row = Math.floor((clientY - rect.top) / rh);
    if (row < 0) return;
    const bufferRow = this.viewTopLine() + row;
    const block = this.blockAt(bufferRow);
    if (!block) {
      this.clearBlockSelection();
      return;
    }
    if (block.id === this.selectedId && this.hasNativeSelection()) {
      this.clearBlockSelection();
      return;
    }
    this.selectBlock(block.id);
  }

  private hasNativeSelection(): boolean {
    return this.engine ? engineHasSelection(this.engine.element) : false;
  }

  /**
   * Select a block's visible rows. The fixed screen only materializes
   * the viewport, so the selection covers the on-screen slice of the
   * block (block text APIs read the full range from the core).
   */
  selectBlock(id: string): void {
    const e = this.entries.find((x) => x.id === id);
    const r = e ? this.rangeOf(e) : null;
    const engine = this.engine;
    if (!r || !engine) return;

    const vpTop = this.viewTopLine();
    const rowEls = engine.element.querySelectorAll(".term-row");
    const first = Math.max(r.start - vpTop, 0);
    const last = Math.min(r.end - vpTop, rowEls.length - 1);
    if (first > last || !rowEls[first] || !rowEls[last]) return;

    const range = document.createRange();
    range.setStartBefore(rowEls[first]);
    range.setEndAfter(rowEls[last]);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    this.selectedId = id;
  }

  clearBlockSelection(): boolean {
    const had = this.hasNativeSelection();
    if (this.engine) clearEngineSelection(this.engine.element);
    this.selectedId = null;
    return had;
  }

  // Steps relative to the selected block when one is selected, otherwise
  // starts from the most recent block.
  navigateBlocks(dir: -1 | 1): void {
    if (this.entries.length === 0) return;
    let idx: number;
    const cur = this.selectedId
      ? this.entries.findIndex((e) => e.id === this.selectedId)
      : -1;
    if (cur >= 0 && this.hasNativeSelection()) {
      idx = cur + dir;
    } else {
      idx = dir < 0 ? this.entries.length - 1 : -1;
    }
    while (idx >= 0 && idx < this.entries.length) {
      const e = this.entries[idx];
      const r = this.rangeOf(e);
      if (r) {
        const engine = this.engine;
        if (engine) {
          engine.scrollTop = Math.max(0, (r.start - 2) * this.rowHeight());
        }
        // Select on the next frame so the scrolled rows are painted.
        requestAnimationFrame(() => this.selectBlock(e.id));
        this.selectedId = e.id;
        return;
      }
      idx += dir;
    }
  }

  dispose(): void {
    if (this.viewportRaf != null) cancelAnimationFrame(this.viewportRaf);
    this.clearSearch();
    for (const e of this.entries) this.disposeEntry(e);
    this.entries.length = 0;
    this.live?.startMarker.dispose();
    this.live = null;
    this.detach();
    for (const d of this.disposers) {
      try {
        d();
      } catch {}
    }
    this.disposers.length = 0;
  }

  private rangeOf(e: Entry): LineRange | null {
    return computeRange(e.startMarker, e.endMarker);
  }

  // Disposed ranges (trimmed-oldest prefix) sort as -1, before any viewport.
  private firstIndexEndingAtOrAfter(line: number): number {
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const r = this.rangeOf(this.entries[mid]);
      if ((r?.end ?? -1) < line) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private toMeta(e: Entry, r: LineRange): BlockMeta {
    return {
      id: e.id,
      command: e.command,
      cwd: e.cwd,
      exitCode: e.exitCode,
      startLine: r.start,
      endLine: r.end,
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
    };
  }

  private emitMode(): void {
    const m = modeOf(this.mode);
    if (m === this.lastMode) return;
    this.lastMode = m;
    this.onMode?.(m);
  }

  private onOsc133(data: string, absoluteLine: number): void {
    const marker = data[0];
    const rest = data.length > 2 && data[1] === ";" ? data.slice(2) : "";
    switch (marker) {
      case "A":
        this.shellState.inCommand = false;
        this.mode = reduceMode(this.mode, { type: "osc133", marker: "A" });
        break;
      case "B":
        this.shellState.inCommand = true;
        this.mode = reduceMode(this.mode, { type: "osc133", marker: "B" });
        break;
      case "C":
        this.shellState.inCommand = true;
        this.mode = reduceMode(this.mode, { type: "osc133", marker: "C" });
        this.startBlock(rest, absoluteLine);
        break;
      case "D":
        this.shellState.inCommand = false;
        this.finishBlock(rest, absoluteLine);
        this.mode = reduceMode(this.mode, { type: "osc133", marker: "D" });
        break;
    }
    this.emitMode();
  }

  /**
   * Remember the command the host input bar just submitted, until the next
   * `133;C` marker. zsh's preexec puts the command text in the C payload, but
   * bash's PS0 cannot — its markers arrive bare, which would leave the block
   * with an empty command (no header text, no `ls`/`git status` widgets).
   * Sanitized the same way the zsh script does: control chars flattened,
   * capped at 256.
   */
  notePendingCommand(text: string): void {
    this.pendingCommand = text.replace(/[\x00-\x1f\x7f]+/g, " ").slice(0, 256);
  }

  private startBlock(commandFromMarker: string, absoluteLine: number): void {
    if (this.live) this.finishBlock("", absoluteLine);
    // The marker payload (zsh: shell-side truth) wins; a bare marker (bash)
    // falls back to the last host-submitted command. Consume-or-discard on
    // every block start so a stale submit never labels a later block.
    const command = commandFromMarker || (this.pendingCommand ?? "");
    this.pendingCommand = null;
    this.live = {
      id: `b${++this.idSeq}`,
      command,
      cwd: this.cwd,
      startedAt: Date.now(),
      startMarker: this.lineSpace.createAnchor(absoluteLine),
      usedAlt: false,
    };
    this.scheduleViewport();
  }

  private finishBlock(codeStr: string, absoluteLine: number): void {
    const lb = this.live;
    if (!lb) return;
    this.live = null;
    if (lb.wiped) {
      // The command erased the scrollback out from under its own start
      // anchor (`clear`); there is no content left to wrap.
      lb.startMarker.dispose();
      this.scheduleViewport();
      return;
    }
    const exit = parseExitCode(codeStr);
    this.entries.push({
      id: lb.id,
      command: lb.command,
      cwd: lb.cwd,
      exitCode: exit,
      startedAt: lb.startedAt,
      finishedAt: Date.now(),
      startMarker: lb.startMarker,
      endMarker: this.lineSpace.createAnchor(absoluteLine),
    });
    while (this.entries.length > MAX_BLOCKS) {
      const old = this.entries.shift();
      if (old) this.disposeEntry(old);
    }
    this.scheduleViewport();
  }

  private disposeEntry(e: Entry): void {
    this.trimCache.delete(e.id);
    try {
      e.startMarker.dispose();
    } catch {}
    try {
      e.endMarker.dispose();
    } catch {}
  }
}

function parseExitCode(s: string): number | null {
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Rect of the character span [col, col+len) within `el`'s text. */
function charSpanRect(
  el: Element | null,
  col: number,
  len: number,
): DOMRect | undefined {
  if (!el) return undefined;
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let start: { node: Text; offset: number } | null = null;
  const end = col + len;
  for (
    let node = walker.nextNode() as Text | null;
    node !== null;
    node = walker.nextNode() as Text | null
  ) {
    const n = node.data.length;
    if (!start && col < consumed + n) start = { node, offset: col - consumed };
    if (start && end <= consumed + n) {
      const range = doc.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(node, end - consumed);
      return range.getBoundingClientRect?.();
    }
    consumed += n;
  }
  return undefined;
}

/**
 * Rect of the n-th occurrence of `query` in `el`'s visible text (clamped
 * to the last occurrence when the visible text repeats the query fewer
 * times than the buffer does).
 */
function occurrenceRect(
  el: Element | null,
  query: string,
  n = 0,
): DOMRect | undefined {
  if (!el || !query) return undefined;
  const text = (el.textContent ?? "").toLowerCase();
  let idx = text.indexOf(query);
  if (idx < 0) return undefined;
  for (let i = 0; i < n; i++) {
    const next = text.indexOf(query, idx + Math.max(1, query.length));
    if (next < 0) break;
    idx = next;
  }
  return charSpanRect(el, idx, query.length);
}

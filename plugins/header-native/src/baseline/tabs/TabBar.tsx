/**
 * The horizontal tab strip: renders the ordered tabs for the active rig, a
 * sliding "active" pill, and the new-tab launcher. Owns the strip-level state
 * shared across items — the drag gesture, rename target, drop gap, pill
 * geometry, and horizontal wheel/scroll-into-view behaviour — and delegates the
 * rendering of each tab to `TabStripItem`.
 *
 * Sub-components live in `./components`; `TabIcon` is re-exported here so the
 * module barrel's `export { TabBar, TabIcon } from "./TabBar"` stays valid.
 */
import { WORKSPACE_SURFACE_ATTR } from "@termco/ui-shell-base";
import { createPortal, Tabs, TabsList } from "../ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { NewTabMenu } from "./components/NewTabMenu";
import { TabStripItem } from "./components/TabStripItem";
import type { DragState } from "./lib/dragState";
import { useSplitDrag } from "./lib/useSplitDrag";
import type { BulkCloseMode, Tab } from "../types";

export { TabIcon } from "./components/TabIcon";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewBlock: () => void;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onClose: (id: number) => void;
  /** Chrome-style bulk close relative to a tab (others / right / left / all). */
  onCloseMany: (anchorId: number, mode: BulkCloseMode) => void;
  /** Open a fresh terminal tab to the right of the given tab. */
  onNewTabRight: (anchorId: number) => void;
  /** Duplicate the given tab into a new adjacent tab. */
  onDuplicate: (id: number) => void;
  /** Pin (promote) a preview tab to persistent on double-click. */
  onPin: (id: number) => void;
  /** Set a terminal tab's custom label; empty string resets to default. */
  onRename: (id: number, title: string) => void;
  /** Move a dragged tab to a new position (insertion gap index 0..tabs.length). */
  onReorder: (fromId: number, toGapIndex: number) => void;
  /** Open a tab in a split beside the current one (context menu / drag-to-edge). */
  onSplit?: (id: number) => void;
  onOverrideLanguage?: (id: number, lang: string | null) => void;
  compact?: boolean;
};

export function TabBar({
  tabs,
  activeId,
  onSelect,
  onNew,
  onNewBlock,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onClose,
  onCloseMany,
  onNewTabRight,
  onDuplicate,
  onPin,
  onRename,
  onReorder,
  onSplit,
  onOverrideLanguage,
  compact,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const drag = useRef<DragState | null>(null);
  const overSplit = useSyncExternalStore(
    useSplitDrag.subscribe,
    () => useSplitDrag.getState().overSplit,
    () => false,
  );
  const splitSurface =
    overSplit && typeof document !== "undefined"
      ? document.querySelector<HTMLElement>(`[${WORKSPACE_SURFACE_ATTR}]`)
      : null;

  // Play the enter animation only for tabs opened after the first paint, never
  // the restored set and never on switch/reorder (triggers are keyed, so they
  // don't remount then). The ref is seeded with the initial ids on first render.
  const seenRef = useRef<Set<number> | null>(null);
  const firstRender = seenRef.current === null;
  let seen = seenRef.current;
  if (seen === null) {
    seen = new Set(tabs.map((t) => t.id));
    seenRef.current = seen;
  }
  useEffect(() => {
    seenRef.current = new Set(tabs.map((t) => t.id));
  }, [tabs]);

  // Single shared pill slides to the active tab instead of each tab toggling
  // its own background. Measured relative to the list (its offsetParent) so it
  // scrolls with the strip for free; transform/width only, no layout on siblings.
  const [pill, setPill] = useState<{ left: number; width: number } | null>(
    null,
  );
  const [pillReady, setPillReady] = useState(false);

  const measurePill = useCallback(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      '[data-tab-active="true"]',
    );
    setPill((previous) => {
      if (!el) return previous === null ? previous : null;
      const next = { left: el.offsetLeft, width: el.offsetWidth };
      return previous?.left === next.left && previous.width === next.width
        ? previous
        : next;
    });
  }, []);

  useLayoutEffect(() => {
    measurePill();
  }, [measurePill, activeId, tabs]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(measurePill);
    ro.observe(list);
    return () => ro.disconnect();
  }, [measurePill]);

  // Hold the transition off until the pill is first placed, so it never slides
  // in from the origin on mount.
  useEffect(() => {
    if (pill && !pillReady) {
      const id = requestAnimationFrame(() => setPillReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [pill, pillReady]);

  const gapAtX = (clientX: number) => {
    const els = Array.from(
      scrollRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [],
    );
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return els.length;
  };

  const endDrag = (currentTarget: HTMLElement) => {
    const st = drag.current;
    if (st) currentTarget.releasePointerCapture?.(st.pointerId);
    drag.current = null;
    setDraggingId(null);
    setDropGap(null);
    useSplitDrag.getState().setOverSplit(false);
    document.body.style.userSelect = "";
  };

  // Horizontal wheel scroll without holding shift.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active tab visible after selection / open.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  const srcIndex = tabs.findIndex((x) => x.id === draggingId);

  return (
    <>
      <div
        ref={scrollRef}
        data-drag-region
        className="min-w-0 shrink overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max items-center gap-0.5">
        <Tabs
          value={String(activeId)}
          onValueChange={(v) => onSelect(Number(v))}
        >
          <TabsList
            ref={listRef}
            className="relative h-7 w-max gap-0.5 bg-transparent p-0"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-0 h-7 rounded-md bg-primary/12"
              style={
                pill
                  ? {
                      width: pill.width,
                      transform: `translate(${pill.left}px, -50%)`,
                      transitionProperty: pillReady
                        ? "transform, width"
                        : "none",
                      transitionDuration: "var(--dur-base)",
                      transitionTimingFunction: "var(--ease-premium)",
                    }
                  : { opacity: 0 }
              }
            />
            {tabs.map((t, i) => (
              <TabStripItem
                key={t.id}
                tab={t}
                index={i}
                tabCount={tabs.length}
                activeId={activeId}
                isNew={!firstRender && !seen.has(t.id)}
                compact={compact}
                srcIndex={srcIndex}
                draggingId={draggingId}
                dropGap={dropGap}
                editingId={editingId}
                setEditingId={setEditingId}
                dragRef={drag}
                setDraggingId={setDraggingId}
                setDropGap={setDropGap}
                gapAtX={gapAtX}
                endDrag={endDrag}
                showAllLanguages={showAllLanguages}
                setShowAllLanguages={setShowAllLanguages}
                onSelect={onSelect}
                onClose={onClose}
                onCloseMany={onCloseMany}
                onNewTabRight={onNewTabRight}
                onDuplicate={onDuplicate}
                onPin={onPin}
                onRename={onRename}
                onReorder={onReorder}
                onSplit={onSplit}
                onOverrideLanguage={onOverrideLanguage}
              />
            ))}
          </TabsList>
        </Tabs>
        <NewTabMenu
          onNew={onNew}
          onNewBlock={onNewBlock}
          onNewPrivate={onNewPrivate}
          onNewPreview={onNewPreview}
          onNewEditor={onNewEditor}
          onNewGitGraph={onNewGitGraph}
        />
        </div>
      </div>
      {splitSurface
        ? createPortal(
            <div
              data-testid="tab-split-drop-indicator"
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-20 w-1/2 border-primary/50 border-l-2 bg-primary/10"
            />,
            splitSurface,
          )
        : null}
    </>
  );
}

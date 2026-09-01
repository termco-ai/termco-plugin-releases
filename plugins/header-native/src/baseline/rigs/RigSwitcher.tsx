/**
 * Rig switcher: the header control that lists rigs and their tabs in a
 * popover, and lets you switch, rename, add, delete, and drag-reorder them.
 *
 * This is the thin container. It wires store state and the drag hook to the
 * presentational rows (`RigRow` / `TabRow`) and the floating drag overlay.
 */

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui";
import { useShortcutLabel } from "../runtime";
import { labelFor, type HeaderRuntime, type Tab } from "../types";
import {
  ArrowRight01Icon,
  PlusSignIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NewRigMenu } from "./components/NewRigMenu";
import { OverlayChip } from "./components/OverlayChip";
import { RigRow } from "./components/RigRow";
import { useRigDrag } from "./hooks/useRigDrag";
import { accentFor } from "./lib/rigColor";

type Props = {
  runtime: HeaderRuntime;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: Tab[];
  onNewRig: () => void;
  onNewSshRig: (connectionId: string) => void;
  onDeleteRig: (id: string) => void;
  onNewTabInRig: (rigId: string) => void;
  onJumpTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onMoveTabToRig: (tabId: number, rigId: string) => void;
  onReorderTab: (
    tabId: number,
    targetTabId: number,
    edge: "top" | "bottom",
  ) => void;
  onReorderRigs: (orderedIds: string[]) => void;
};

/**
 * The rigs popover control. Reads the rig list/active id from the rigs
 * store and delegates all tab/rig mutations to the callbacks in {@link Props}.
 * Returns `null` until an active rig exists.
 */
export function RigSwitcher({
  runtime,
  open,
  onOpenChange,
  tabs,
  onNewRig,
  onNewSshRig,
  onDeleteRig,
  onNewTabInRig,
  onJumpTab,
  onCloseTab,
  onMoveTabToRig,
  onReorderTab,
  onReorderRigs,
}: Props) {
  const rigs = runtime.rigs;
  const activeId = runtime.activeRigId;
  const setActive = runtime.activateRig;
  const rename = runtime.renameRig;
  const shortcut = useShortcutLabel("rig.overview", runtime.platform);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    activeId ? new Set([activeId]) : new Set(),
  );

  const { dragging, drop, overlay, onPointerDown, onPointerMove, onPointerUp } =
    useRigDrag({
      rigs,
      onMoveTabToRig,
      onReorderTab,
      onReorderRigs,
    });

  const current = rigs.find((s) => s.id === activeId);

  const tabsByRig = useMemo(() => {
    const m = new Map<string, Tab[]>();
    for (const t of tabs) {
      const arr = m.get(t.rigId);
      if (arr) arr.push(t);
      else m.set(t.rigId, [t]);
    }
    return m;
  }, [tabs]);

  // Filtering spans rigs and their tabs: typing a tab name surfaces the rig
  // that holds it, already expanded, so one query finds anything open.
  const query = filter.trim().toLowerCase();
  const visibleRigs = useMemo(() => {
    if (!query)
      return [...rigs].map((r) => ({
        rig: r,
        tabs: tabsByRig.get(r.id) ?? [],
        forceOpen: false,
      }));
    const out: {
      rig: (typeof rigs)[number];
      tabs: Tab[];
      forceOpen: boolean;
    }[] = [];
    for (const r of rigs) {
      const all = tabsByRig.get(r.id) ?? [];
      const nameHit = r.name.toLowerCase().includes(query);
      const tabHits = all.filter((t) =>
        labelFor(t).toLowerCase().includes(query),
      );
      if (nameHit)
        out.push({ rig: r, tabs: all, forceOpen: tabHits.length > 0 });
      else if (tabHits.length > 0)
        out.push({ rig: r, tabs: tabHits, forceOpen: true });
    }
    return out;
  }, [rigs, tabsByRig, query]);

  const draggedTab =
    dragging?.kind === "tab"
      ? (tabs.find((t) => t.id === dragging.id) ?? null)
      : null;
  const draggedRig =
    dragging?.kind === "rig"
      ? (rigs.find((s) => s.id === dragging.id) ?? null)
      : null;

  useEffect(() => {
    // A stale filter would make the popover open onto a subset next time.
    if (!open) setFilter("");
    if (!open || !activeId) return;
    setExpanded((prev) =>
      prev.has(activeId) ? prev : new Set(prev).add(activeId),
    );
  }, [open, activeId]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!current) return null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          data-onboarding-target="header.rig-overview"
          type="button"
          title={shortcut ? `Manage rigs · ${shortcut}` : "Manage rigs"}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/90 outline-none transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={14}
            strokeWidth={1.75}
            className="shrink-0 rotate-90 opacity-75"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={7}
        className="w-[22rem] gap-0 overflow-hidden p-0"
      >
        <div className="border-b border-border/70 px-3.5 py-3">
          <p className="text-xs font-semibold text-foreground">Workspaces</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Switch rigs, move tabs, or open a new environment.
          </p>
        </div>
        <div className="relative flex items-center border-b border-border/70 p-2">
          <HugeiconsIcon
            icon={Search01Icon}
            size={14}
            strokeWidth={1.8}
            className="absolute left-4 text-muted-foreground"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter rigs & tabs…"
            aria-label="Filter rigs and tabs"
            className="h-8 w-full rounded-md border border-border bg-card pr-2.5 pl-8 text-xs outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {visibleRigs.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No rigs or tabs match “{filter.trim()}”.
            </div>
          ) : null}
          {visibleRigs.map(({ rig: sp, tabs: rigTabs, forceOpen }) => (
            <RigRow
              key={sp.id}
              rig={sp}
              tabs={rigTabs}
              isActive={sp.id === activeId}
              canDelete={rigs.length > 1}
              expanded={forceOpen || expanded.has(sp.id)}
              editing={editingId === sp.id}
              dragging={dragging}
              drop={drop}
              draggingTabFromOther={
                draggedTab !== null && draggedTab.rigId !== sp.id
              }
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onToggle={() => toggleExpand(sp.id)}
              onSwitch={() => {
                setActive(sp.id);
                onOpenChange(false);
              }}
              onStartRename={() => setEditingId(sp.id)}
              onCommitRename={(name) => {
                const v = name.trim();
                if (v) rename(sp.id, v);
                setEditingId(null);
              }}
              onCancelRename={() => setEditingId(null)}
              onDelete={() => onDeleteRig(sp.id)}
              onNewTab={() => onNewTabInRig(sp.id)}
              onJumpTab={(id) => {
                onJumpTab(id);
                onOpenChange(false);
              }}
              onCloseTab={onCloseTab}
            />
          ))}
        </div>
        <div className="border-t border-border/60 bg-muted/20 p-1.5">
          <NewRigMenu onNewRig={onNewRig} onNewSshRig={onNewSshRig}>
            <button
              data-onboarding-target="header.new-rig"
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent/60 data-[state=open]:text-foreground"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.75} />
              <span className="flex-1">New rig</span>
            </button>
          </NewRigMenu>
        </div>
      </PopoverContent>
      {overlay &&
        (draggedRig || draggedTab) &&
        createPortal(
          <div
            data-termco-overlay="true"
            className="pointer-events-none fixed z-[60]"
            style={{ left: overlay.x + 12, top: overlay.y + 8 }}
          >
            {draggedRig ? (
              <OverlayChip
                color={accentFor(draggedRig)}
                label={draggedRig.name}
              />
            ) : draggedTab ? (
              <OverlayChip tab={draggedTab} label={labelFor(draggedTab)} />
            ) : null}
          </div>,
          document.body,
        )}
    </Popover>
  );
}

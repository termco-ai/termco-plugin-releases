import type { UiHeaderTab } from "@termco/ui-header-base";
import { useMemo } from "react";
import { cn, useOverlayGuard } from "../ui";
import { labelFor } from "../types";
import { TabIcon } from "./components/TabIcon";
import type { TabSwitcherState } from "./lib/useTabSwitcher";

function subtitleFor(tab: UiHeaderTab): string | null {
  if (tab.kind === "terminal") {
    return tab.cwd
      ? tab.cwd.split(/[\\/]/).filter(Boolean).slice(-2).join("/") || tab.cwd
      : null;
  }
  if (tab.kind === "editor" || tab.kind === "markdown") {
    return tab.path?.split(/[\\/]/).filter(Boolean).slice(-2, -1)[0] ?? null;
  }
  return null;
}

/** Exact baseline MRU overlay. It lives with the tab strip it presents. */
export function TabSwitcherHud({
  tabs,
  state,
}: {
  tabs: readonly UiHeaderTab[];
  state: TabSwitcherState;
}) {
  useOverlayGuard();
  const byId = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const rows = state.order
    .map((id) => byId.get(id))
    .filter((tab): tab is UiHeaderTab => tab !== undefined);
  const selectedId = state.order[state.index];

  return (
    <div
      aria-hidden
      data-testid="tab-switcher-hud"
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
    >
      <div className="termco-floating flex max-h-[60vh] w-72 flex-col gap-0.5 overflow-y-auto rounded-lg p-1.5">
        {rows.map((tab) => {
          const subtitle = subtitleFor(tab);
          return (
            <div
              key={tab.id}
              className={cn(
                "flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs",
                tab.id === selectedId
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <TabIcon tab={tab} />
              <span className="min-w-0 flex-1 truncate">{labelFor(tab)}</span>
              {subtitle ? (
                <span className="shrink-0 truncate text-xs text-muted-foreground/55">
                  {subtitle}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

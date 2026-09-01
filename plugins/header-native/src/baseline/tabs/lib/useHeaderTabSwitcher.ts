import type {
  ShortcutHandlers,
  ShortcutRegistryCapability,
} from "@termco/shortcuts-base";
import type { UiHeaderTab } from "@termco/ui-header-base";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTabSwitcher } from "./useTabSwitcher";

type Options = {
  tabs: readonly UiHeaderTab[];
  allTabs: readonly UiHeaderTab[];
  activeId: number;
  selectTab(id: number): void;
  shortcuts: ShortcutRegistryCapability;
};

/** Tracks MRU order and owns the tab.next/tab.prev shortcut workflow. */
export function useHeaderTabSwitcher({
  tabs,
  allTabs,
  activeId,
  selectTab,
  shortcuts,
}: Options) {
  const mruRef = useRef<number[]>([activeId]);
  const allTabsRef = useRef(allTabs);
  const rigTabsRef = useRef(tabs);
  allTabsRef.current = allTabs;
  rigTabsRef.current = tabs;

  useEffect(() => {
    mruRef.current = [
      activeId,
      ...mruRef.current.filter((id) => id !== activeId),
    ];
  }, [activeId]);

  useEffect(() => {
    const live = new Set(allTabs.map((tab) => tab.id));
    mruRef.current = mruRef.current.filter((id) => live.has(id));
  }, [allTabs]);

  const getOrder = useCallback(() => {
    const inRig = rigTabsRef.current.map((tab) => tab.id);
    const present = new Set(inRig);
    const ordered = mruRef.current.filter((id) => present.has(id));
    for (const id of inRig) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    return [activeId, ...ordered.filter((id) => id !== activeId)];
  }, [activeId]);

  const { state, step } = useTabSwitcher({
    getOrder,
    onCommit(id) {
      if (allTabsRef.current.some((tab) => tab.id === id)) selectTab(id);
    },
  });

  const handlers = useMemo<ShortcutHandlers>(
    () => ({
      "tab.next": () => step(1),
      "tab.prev": () => step(-1),
    }),
    [step],
  );
  shortcuts.useHandlers(handlers);

  return state;
}

/**
 * Behaviour for the header's inline search field: local query state, the
 * find-active toggle (the bar rests as a palette launcher), the
 * shortcut-derived placeholder, and the imperative focus handle. All interaction with the current {@link SearchTarget}
 * (incremental find, next/previous, clearing decorations, restoring focus) is
 * funnelled through here so the component stays purely presentational.
 */

import { useShortcutLabel } from "../../runtime";
import type { HeaderRuntime } from "../../types";
import type { ForwardedRef } from "react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SearchInlineHandle, SearchTarget } from "../types";

const TERM_DECORATIONS = {
  matchBackground: "#515c6a",
  activeMatchBackground: "#d18616",
  matchOverviewRuler: "#d18616",
  activeMatchColorOverviewRuler: "#d18616",
};

export function useInlineSearch(
  target: SearchTarget,
  ref: ForwardedRef<SearchInlineHandle>,
  runtime: HeaderRuntime,
) {
  const [q, setQ] = useState("");
  // The bar rests as a palette launcher; the find shortcut takes it over and
  // hands it back on Escape. Compact chrome keeps the same shortcut contract.
  const [findActive, setFindActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef(false);
  const setInputRef = useCallback((el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (!el || !pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    el.focus();
  }, []);

  const shortcutText = useShortcutLabel("search.focus", runtime.platform);

  const baseLabel = target?.kind === "git-history" ? "Git search" : "Search";

  const placeholder = useMemo(() => {
    return shortcutText ? `${baseLabel} (${shortcutText})` : baseLabel;
  }, [baseLabel, shortcutText]);

  const tooltipTitle = useMemo(() => {
    return shortcutText ? `${baseLabel} (${shortcutText})` : baseLabel;
  }, [baseLabel, shortcutText]);

  const expanded = findActive;

  const focus = useCallback(() => {
    pendingFocusRef.current = true;
    setFindActive(true);
    inputRef.current?.focus();
    if (inputRef.current) pendingFocusRef.current = false;
  }, []);

  useImperativeHandle(ref, () => ({ focus }), [focus]);

  const clearTarget = useCallback(() => {
    target?.clear();
  }, [target]);

  const restoreTargetFocus = useCallback(() => {
    if (!target) return;
    target.focus();
  }, [target]);

  // Target switched (terminal ↔ editor) or removed → drop highlights.
  useEffect(() => clearTarget, [clearTarget]);

  const applyIncremental = (next: string) => {
    if (!target) return;
    if (next) target.findNext(next, { ...TERM_DECORATIONS, incremental: true });
    else target.clear();
  };

  const findDirection = (forward: boolean) => {
    if (!target || !q) return;
    if (target.kind === "git-history") return;
    if (forward) target.findNext(q, TERM_DECORATIONS);
    else target.findPrevious(q, TERM_DECORATIONS);
    // git-history: the list filters live; Enter has no next/prev semantics.
  };

  return {
    q,
    setQ,
    setFindActive,
    inputRef,
    setInputRef,
    placeholder,
    tooltipTitle,
    expanded,
    focus,
    clearTarget,
    restoreTargetFocus,
    applyIncremental,
    findDirection,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";

export type TabSwitcherState = { order: number[]; index: number };

type Options = {
  getOrder: () => number[];
  onCommit: (id: number) => void;
};

/** Exact modifier-release switcher interaction owned by the header plugin. */
export function useTabSwitcher({ getOrder, onCommit }: Options) {
  const [state, setState] = useState<TabSwitcherState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const callbacks = useRef({ getOrder, onCommit });
  callbacks.current = { getOrder, onCommit };

  const step = useCallback((delta: 1 | -1) => {
    setState((previous) => {
      if (previous) {
        const length = previous.order.length;
        return {
          ...previous,
          index: (previous.index + delta + length) % length,
        };
      }
      const order = callbacks.current.getOrder();
      if (order.length < 2) return null;
      return {
        order,
        index: (delta + order.length) % order.length,
      };
    });
  }, []);

  const commit = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    setState(null);
    const id = current.order[current.index];
    if (id !== undefined && id !== current.order[0]) {
      callbacks.current.onCommit(id);
    }
  }, []);

  const cancel = useCallback(() => setState(null), []);

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (!stateRef.current) return;
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        commit();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (stateRef.current && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      }
    };
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("blur", cancel);
    };
  }, [cancel, commit]);

  return { state, step };
}

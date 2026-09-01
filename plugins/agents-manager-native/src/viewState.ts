import type {
  UiAgentsViewCapability,
  UiAgentsViewSnapshot,
} from "@termco/ui-agents-base";

export function createAgentsViewState(): UiAgentsViewCapability {
  let snapshot: UiAgentsViewSnapshot = {
    revision: 0,
    open: false,
    openSequence: 0,
  };
  const listeners = new Set<() => void>();
  const publish = (open: boolean) => {
    snapshot = {
      revision: snapshot.revision + 1,
      open,
      openSequence: open ? snapshot.openSequence + 1 : snapshot.openSequence,
    };
    for (const listener of listeners) listener();
  };
  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show: () => publish(true),
    close: () => publish(false),
    toggle: () => publish(!snapshot.open),
  };
}

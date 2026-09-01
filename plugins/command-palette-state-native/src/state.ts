import type {
  UiCommandPaletteCapability,
  UiCommandPaletteMode,
  UiCommandPaletteSnapshot,
} from "@termco/ui-overlays-base";

export function createCommandPaletteState(): UiCommandPaletteCapability {
  let snapshot: UiCommandPaletteSnapshot = {
    revision: 0,
    open: false,
    mode: "commands",
    query: "",
    anchor: null,
    inputSlot: null,
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<UiCommandPaletteSnapshot>) => {
    snapshot = { ...snapshot, ...patch, revision: snapshot.revision + 1 };
    for (const listener of listeners) listener();
  };
  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show(mode: UiCommandPaletteMode = "commands") {
      publish({
        open: true,
        mode,
        query:
          mode === "content"
            ? "#"
            : mode === "history"
              ? ">"
              : mode === "help"
                ? "?"
                : "",
      });
    },
    close() {
      if (snapshot.open) publish({ open: false });
    },
    setOpen(open) {
      if (snapshot.open === open) return;
      publish(open ? { open, mode: "commands", query: "" } : { open });
    },
    setQuery(query) {
      if (snapshot.query !== query) publish({ query });
    },
    setAnchor(anchor) {
      if (snapshot.anchor !== anchor) publish({ anchor });
    },
    setInputSlot(inputSlot) {
      if (snapshot.inputSlot !== inputSlot) publish({ inputSlot });
    },
  };
}

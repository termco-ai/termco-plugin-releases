/**
 * Tiny renderer store: which open files have an active LSP session (and which
 * server). Written by the docSync plugin, read by the status bar pill.
 */
import { create } from "zustand";
import type { EditorLspStatusCapability } from "@termco/editor-base";
import { workspaceScopeKey } from "../../../workspace";

type State = {
  /** `${scopeKey}\u0000${path}` → serverId */
  active: Record<string, string>;
  setActive: (key: string, serverId: string | null) => void;
};

export const useLspStatusStore = create<State>((set) => ({
  active: {},
  setActive: (key, serverId) =>
    set((s) => {
      if (serverId == null) {
        if (!(key in s.active)) return s;
        const next = { ...s.active };
        delete next[key];
        return { active: next };
      }
      if (s.active[key] === serverId) return s;
      return { active: { ...s.active, [key]: serverId } };
    }),
}));

export function lspStatusKey(scopeKey: string, path: string): string {
  return `${scopeKey}\u0000${path}`;
}

export const editorLspStatus: EditorLspStatusCapability = {
  serverId(workspace, path) {
    if (!path) return null;
    return (
      useLspStatusStore.getState().active[
        lspStatusKey(workspaceScopeKey(workspace), path)
      ] ?? null
    );
  },
  subscribe: useLspStatusStore.subscribe,
};

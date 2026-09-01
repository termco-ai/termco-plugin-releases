/**
 * Tracks which container's detail tab is currently active, so the sidebar can
 * highlight the matching card (like the active editor tab highlights its file
 * in the explorer). Set by App from the active tab; read by ContainersPanel.
 * Keyed by `${runtime}:${id}` (rowKey), or null when no container tab is active.
 */
import { create } from "zustand";

type State = {
  activeKey: string | null;
  setActiveKey: (key: string | null) => void;
};

export const useActiveContainerTab = create<State>((set) => ({
  activeKey: null,
  setActiveKey: (key) =>
    set((s) => (s.activeKey === key ? s : { activeKey: key })),
}));

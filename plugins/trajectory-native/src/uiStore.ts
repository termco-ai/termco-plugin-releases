import { create } from "zustand";
import type { CheckpointReference } from "./actions";

export type ForkPrompt = {
  readonly sessionId: string;
  readonly eventSeq: number;
  readonly backend: string;
  readonly fidelity: "full" | "adapter";
  readonly mode: "fork" | "rerun";
  readonly checkpoint: CheckpointReference | null;
};

type HighlightRequest = { sessionId: string; eventSeq: number; nonce: number };

type TrajectoryUiState = {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  forkPrompt: ForkPrompt | null;
  setForkPrompt: (prompt: ForkPrompt | null) => void;
  highlight: HighlightRequest | null;
  requestHighlight: (sessionId: string, eventSeq: number) => void;
};

let nonce = 0;

export const useTrajectoryUi = create<TrajectoryUiState>((set) => ({
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  forkPrompt: null,
  setForkPrompt: (forkPrompt) => set({ forkPrompt }),
  highlight: null,
  requestHighlight: (sessionId, eventSeq) =>
    set({ highlight: { sessionId, eventSeq, nonce: ++nonce } }),
}));

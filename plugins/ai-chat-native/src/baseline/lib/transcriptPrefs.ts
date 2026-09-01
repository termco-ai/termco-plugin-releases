/**
 * Small, self-contained transcript display preferences shared by the normal
 * chat AND the coding-agents transcript (both render through the same
 * `RenderedMessage`/part renderers). Persisted to localStorage so the choice
 * sticks across sessions and windows. Kept separate from the app-wide
 * Preferences schema so it stays a lightweight, renderer-only toggle.
 */

import { create } from "zustand";

const KEY = "termco-transcript-prefs";

type Persisted = {
  /** Show assistant reasoning/thinking blocks in transcripts. */
  showThinking: boolean;
};

const DEFAULTS: Persisted = { showThinking: true };

function load(): Persisted {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function save(p: Persisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

type State = Persisted & {
  setShowThinking: (v: boolean) => void;
  toggleShowThinking: () => void;
};

export const useTranscriptPrefs = create<State>((set, get) => ({
  ...load(),
  setShowThinking: (v) => {
    set({ showThinking: v });
    save({ showThinking: v });
  },
  toggleShowThinking: () => {
    const next = !get().showThinking;
    set({ showThinking: next });
    save({ showThinking: next });
  },
}));

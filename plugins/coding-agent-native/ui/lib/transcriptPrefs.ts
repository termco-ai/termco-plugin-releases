import { create } from "zustand";

const KEY = "termco-transcript-prefs";

function initial(): boolean {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as {
      showThinking?: unknown;
    };
    return typeof parsed.showThinking === "boolean" ? parsed.showThinking : true;
  } catch {
    return true;
  }
}

export const useTranscriptPrefs = create<{
  showThinking: boolean;
  setShowThinking(value: boolean): void;
}>((set) => ({
  showThinking: initial(),
  setShowThinking(value) {
    set({ showThinking: value });
    try {
      localStorage.setItem(KEY, JSON.stringify({ showThinking: value }));
    } catch {
      // Persistence is optional in restricted renderer contexts.
    }
  },
}));

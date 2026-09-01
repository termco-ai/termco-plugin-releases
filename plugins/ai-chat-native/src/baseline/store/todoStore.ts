import { create } from "zustand";
import type { Todo } from "../lib/todos";

// In-memory only (no persistence): a todo list lives exactly as long as the
// agent run that owns it. See lib/todos.ts for the rationale.
type TodosState = {
  /** Map of sessionId -> todos. */
  bySession: Record<string, Todo[]>;
  setTodos: (sessionId: string, todos: Todo[]) => void;
  clearSession: (sessionId: string) => void;
};

export const useTodosStore = create<TodosState>((set) => ({
  bySession: {},

  setTodos(sessionId, todos) {
    set((s) => ({
      bySession: { ...s.bySession, [sessionId]: todos },
    }));
  },

  clearSession(sessionId) {
    set((s) => {
      if (!(sessionId in s.bySession)) return s;
      const next = { ...s.bySession };
      delete next[sessionId];
      return { bySession: next };
    });
  },
}));

export function getTodos(sessionId: string | null): Todo[] {
  if (!sessionId) return [];
  return useTodosStore.getState().bySession[sessionId] ?? [];
}

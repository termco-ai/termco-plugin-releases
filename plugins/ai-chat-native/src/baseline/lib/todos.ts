// Todos are intentionally NOT persisted. A todo list belongs to a single agent
// run: it appears while the run works, and is cleared when the run ends, is
// stopped, errors, or the app quits. Persisting them resurrected stale,
// forever-spinning todos on the next launch, so the store is in-memory only.

type TodoStatus = "pending" | "in_progress" | "completed";

export type Todo = {
  id: string;
  title: string;
  description?: string;
  /** Present-continuous label shown while the item is in_progress (e.g. "Running tests"). */
  activeForm?: string;
  status: TodoStatus;
};

export function newTodoId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Validate a candidate todo list:
 *  - At most one item with status `in_progress` (anti-drift invariant).
 *  - Titles must be non-empty.
 * Returns null on valid, otherwise an error string.
 */
export function validateTodos(todos: Todo[]): string | null {
  let inProgress = 0;
  for (const t of todos) {
    if (!t.title.trim()) return "todo title cannot be empty";
    if (t.status === "in_progress") inProgress++;
  }
  if (inProgress > 1)
    return `only one todo may be in_progress at a time (got ${inProgress})`;
  return null;
}

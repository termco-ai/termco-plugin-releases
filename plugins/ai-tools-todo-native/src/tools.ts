import type {
  AiSessionTodo,
  AiToolContribution,
  AiToolDefinition,
} from "@termco/ai-tools-base";

function values(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}

function normalize(input: unknown): AiSessionTodo[] | string {
  const raw = values(input).todos;
  if (!Array.isArray(raw)) return "todos must be an array";
  const todos: AiSessionTodo[] = [];
  let inProgress = 0;
  for (const [index, value] of raw.entries()) {
    const item = values(value);
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const status = item.status;
    if (!title) return `todo ${index + 1} needs a title`;
    if (status !== "pending" && status !== "in_progress" && status !== "completed") {
      return `todo ${index + 1} has an invalid status`;
    }
    if (status === "in_progress") inProgress += 1;
    todos.push({
      id:
        typeof item.id === "string" && item.id.trim()
          ? item.id
          : `todo-${Date.now()}-${index}`,
      title,
      status,
      ...(typeof item.description === "string"
        ? { description: item.description }
        : {}),
      ...(typeof item.activeForm === "string"
        ? { activeForm: item.activeForm }
        : {}),
    });
  }
  return inProgress > 1 ? "only one todo may be in_progress" : todos;
}

export function createTodoContribution(): AiToolContribution {
  return {
    id: "todo",
    group: "core",
    order: 140,
    build(runtime) {
      const definition: AiToolDefinition = {
        description:
          "Replace your current task list for non-trivial multi-step work. Pass the FULL list on every call, keep at most one item in_progress, and mark work completed immediately.",
        inputSchema: {
          type: "object",
          properties: {
            todos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string", minLength: 1 },
                  description: { type: "string" },
                  activeForm: { type: "string" },
                  status: {
                    type: "string",
                    enum: ["pending", "in_progress", "completed"],
                  },
                },
                required: ["title", "status"],
                additionalProperties: false,
              },
            },
          },
          required: ["todos"],
          additionalProperties: false,
        },
        async execute(input) {
          const sessionId = runtime.getSessionId?.();
          if (!sessionId || !runtime.replaceTodos) {
            return { error: "the selected AI session does not expose task state" };
          }
          const todos = normalize(input);
          if (typeof todos === "string") return { error: todos };
          runtime.replaceTodos(sessionId, todos);
          return {
            ok: true,
            count: todos.length,
            inProgress:
              todos.find((todo) => todo.status === "in_progress")?.title ?? null,
          };
        },
      };
      return { todo_write: definition };
    },
  };
}

import { describe, expect, it, vi } from "vitest";
import { createTodoContribution } from "./tools";

describe("todo_write contribution", () => {
  it("replaces one session-owned list and rejects two active tasks", async () => {
    const replaceTodos = vi.fn();
    const tool = createTodoContribution().build({
      getSessionId: () => "s1",
      replaceTodos,
    }).todo_write;
    await expect(tool.execute?.({
      todos: [{ title: "One", status: "in_progress" }],
    })).resolves.toMatchObject({ ok: true, count: 1 });
    expect(replaceTodos).toHaveBeenCalledWith(
      "s1",
      [expect.objectContaining({ title: "One", status: "in_progress" })],
    );
    await expect(tool.execute?.({
      todos: [
        { title: "One", status: "in_progress" },
        { title: "Two", status: "in_progress" },
      ],
    })).resolves.toMatchObject({ error: expect.stringContaining("only one") });
  });
});

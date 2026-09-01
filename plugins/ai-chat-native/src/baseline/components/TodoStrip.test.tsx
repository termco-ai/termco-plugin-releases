// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Todo } from "../lib/todos";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  globalThis.ResizeObserver ?? (ResizeObserverStub as never);

import { useTodosStore } from "../store/todoStore";
import { TodoStrip } from "./TodoStrip";

afterEach(cleanup);

beforeEach(() => {
  useTodosStore.setState({ bySession: {} });
});

function seed(sessionId: string, todos: Todo[]) {
  useTodosStore.setState({ bySession: { [sessionId]: todos } });
}

const TODOS: Todo[] = [
  { id: "t1", title: "Write tests", status: "completed" },
  { id: "t2", title: "Fix bug", status: "in_progress", description: "in x.ts" },
  { id: "t3", title: "Ship it", status: "pending" },
];

describe("TodoStrip", () => {
  it("renders nothing without a session", () => {
    const { container } = render(<TodoStrip sessionId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the session has no todos", () => {
    seed("s1", []);
    const { container } = render(<TodoStrip sessionId="s1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the completed count and every todo title", () => {
    seed("s1", TODOS);
    render(<TodoStrip sessionId="s1" />);
    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("Write tests")).toBeInTheDocument();
    expect(screen.getByText("Fix bug")).toBeInTheDocument();
    expect(screen.getByText("Ship it")).toBeInTheDocument();
  });

  it("strikes through completed todos", () => {
    seed("s1", TODOS);
    render(<TodoStrip sessionId="s1" />);
    expect(screen.getByText("Write tests")).toHaveClass("line-through");
    expect(screen.getByText("Ship it")).not.toHaveClass("line-through");
  });

  it("shows a spinner for the in-progress todo", () => {
    seed("s1", TODOS);
    render(<TodoStrip sessionId="s1" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    const row = screen.getByText("Fix bug").closest("li");
    expect(row?.querySelector('[role="status"]')).toBeInTheDocument();
  });

  it("does not render a spinner when nothing is in progress", () => {
    seed("s1", [{ id: "t1", title: "Only", status: "pending" }]);
    render(<TodoStrip sessionId="s1" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows activeForm instead of the title while in_progress", () => {
    seed("s1", [
      {
        id: "t1",
        title: "Run tests",
        activeForm: "Running tests",
        status: "in_progress",
      },
      { id: "t2", title: "Ship it", activeForm: "Shipping", status: "pending" },
    ]);
    render(<TodoStrip sessionId="s1" />);
    // in_progress row shows the active form…
    expect(screen.getByText("Running tests")).toBeInTheDocument();
    expect(screen.queryByText("Run tests")).not.toBeInTheDocument();
    // …but a non-in_progress row keeps its title, ignoring activeForm.
    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.queryByText("Shipping")).not.toBeInTheDocument();
  });
});

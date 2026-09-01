// @vitest-environment jsdom
import { Command, CommandList } from "../../ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncQueryState } from "../hooks/useAsyncQuery";
import { HistoryView } from "./HistoryView";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function history(
  overrides: Partial<AsyncQueryState<string>> = {},
): AsyncQueryState<string> {
  return {
    results: [],
    loading: false,
    error: null,
    retry: () => {},
    ...overrides,
  };
}

function setup(props: Partial<Parameters<typeof HistoryView>[0]> = {}) {
  const onRun = vi.fn();
  render(
    <Command>
      <CommandList>
        <HistoryView
          insertCommand={
            props.insertCommand === undefined ? () => {} : props.insertCommand
          }
          history={props.history ?? history()}
          onRun={props.onRun ?? onRun}
        />
      </CommandList>
    </Command>,
  );
  return onRun;
}

describe("HistoryView", () => {
  it("asks for a terminal when insert is unavailable", () => {
    setup({ insertCommand: null });
    expect(screen.getByText("Open a terminal to run history")).toBeDefined();
  });

  it("shows the empty label without history", () => {
    setup({ history: history() });
    expect(screen.getByText("No history")).toBeDefined();
  });

  it("renders history rows and runs the picked command", () => {
    const onRun = vi.fn();
    setup({
      history: history({ results: ["git status", "pnpm test"] }),
      onRun,
    });
    fireEvent.click(
      screen.getByText("pnpm test").closest("[cmdk-item]") as HTMLElement,
    );
    expect(onRun).toHaveBeenCalledWith("pnpm test");
  });

  it("shows the error state", () => {
    setup({ history: history({ error: "boom" }) });
    expect(screen.getByText("Search failed")).toBeDefined();
  });
});

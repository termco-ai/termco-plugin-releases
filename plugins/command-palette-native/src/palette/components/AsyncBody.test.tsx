// @vitest-environment jsdom
import { Command, CommandList } from "../../ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncBody } from "./AsyncBody";

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

function wrap(ui: ReactNode) {
  return render(
    <Command>
      <CommandList>{ui}</CommandList>
    </Command>,
  );
}

const base = {
  loading: false,
  error: null as string | null,
  empty: false,
  emptyLabel: "No matches",
  onRetry: () => {},
};

describe("AsyncBody", () => {
  it("renders the error state with a retry row", () => {
    const onRetry = vi.fn();
    wrap(
      <AsyncBody {...base} error="boom" onRetry={onRetry}>
        <span>rows</span>
      </AsyncBody>,
    );
    expect(screen.getByText("Search failed")).toBeDefined();
    expect(screen.queryByText("rows")).toBeNull();
    fireEvent.click(
      screen.getByText("Retry").closest("[cmdk-item]") as HTMLElement,
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("error wins over loading and empty", () => {
    wrap(
      <AsyncBody {...base} error="boom" loading empty>
        <span>rows</span>
      </AsyncBody>,
    );
    expect(screen.getByText("Search failed")).toBeDefined();
    expect(screen.queryByText("Searching...")).toBeNull();
  });

  it("shows the searching state while loading with no results", () => {
    wrap(
      <AsyncBody {...base} loading empty>
        <span>rows</span>
      </AsyncBody>,
    );
    expect(screen.getByText("Searching...")).toBeDefined();
  });

  it("shows the empty label when settled without results", () => {
    wrap(
      <AsyncBody {...base} empty>
        <span>rows</span>
      </AsyncBody>,
    );
    expect(screen.getByText("No matches")).toBeDefined();
  });

  it("renders children when results exist", () => {
    wrap(
      <AsyncBody {...base}>
        <span>rows</span>
      </AsyncBody>,
    );
    expect(screen.getByText("rows")).toBeDefined();
  });

  it("keeps existing results visible while reloading", () => {
    wrap(
      <AsyncBody {...base} loading>
        <span>rows</span>
      </AsyncBody>,
    );
    expect(screen.getByText("rows")).toBeDefined();
    expect(screen.queryByText("Searching...")).toBeNull();
  });
});

// @vitest-environment jsdom
import { Command, CommandList } from "../../ui";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusItem } from "./StatusItem";

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

describe("StatusItem", () => {
  it("renders a disabled row with the label", () => {
    wrap(<StatusItem label="Searching..." />);
    const row = screen.getByText("Searching...").closest("[cmdk-item]");
    expect(row?.getAttribute("aria-disabled")).toBe("true");
  });

  it("renders muted tone without a warning icon", () => {
    // The shared CommandItem always renders its built-in check glyph, so the
    // muted row carries exactly that one svg and no warning icon.
    const { container } = wrap(<StatusItem label="No matches" />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.getByText("No matches").className).toContain(
      "text-muted-foreground",
    );
  });

  it("renders error tone with a warning icon and destructive color", () => {
    const { container } = wrap(<StatusItem label="Failed" tone="error" />);
    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(screen.getByText("Failed").className).toContain("text-destructive");
  });
});

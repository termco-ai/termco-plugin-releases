// @vitest-environment jsdom
import { Command, CommandList } from "../../ui";
import { TerminalIcon } from "@hugeicons/core-free-icons";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaletteItem } from "../types";
import { ActionItem } from "./ActionItem";

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

function item(overrides: Partial<PaletteItem> = {}): PaletteItem {
  return {
    id: "tab.new",
    title: "New terminal",
    group: "Tabs",
    run: () => {},
    ...overrides,
  };
}

describe("ActionItem", () => {
  it("renders the title and runs on click", () => {
    const onRun = vi.fn();
    wrap(<ActionItem item={item()} shortcutLabel={null} onRun={onRun} />);
    const row = screen
      .getByText("New terminal")
      .closest("[cmdk-item]") as HTMLElement;
    fireEvent.click(row);
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("shows the shortcut label when provided", () => {
    wrap(<ActionItem item={item()} shortcutLabel="Ctrl T" onRun={() => {}} />);
    expect(screen.getByText("Ctrl T")).toBeDefined();
  });

  it("keeps descriptions out of action rows", () => {
    wrap(
      <ActionItem
        item={item({ description: "Create another terminal session." })}
        shortcutLabel="Ctrl T"
        onRun={() => {}}
      />,
    );
    expect(screen.getByText("New terminal")).toBeDefined();
    expect(screen.getByText("Ctrl T")).toBeDefined();
    expect(screen.queryByText("Create another terminal session.")).toBeNull();
  });

  it("prefers the disabled reason over trailing and shortcut", () => {
    wrap(
      <ActionItem
        item={item({ disabledReason: "Last tab", trailing: "#" })}
        shortcutLabel="Ctrl T"
        onRun={() => {}}
      />,
    );
    expect(screen.getByText("Last tab")).toBeDefined();
    expect(screen.queryByText("#")).toBeNull();
    expect(screen.queryByText("Ctrl T")).toBeNull();
  });

  it("prefers trailing text over the shortcut label", () => {
    wrap(
      <ActionItem
        item={item({ trailing: ">" })}
        shortcutLabel="Ctrl T"
        onRun={() => {}}
      />,
    );
    expect(screen.getByText(">")).toBeDefined();
    expect(screen.queryByText("Ctrl T")).toBeNull();
  });

  it("disables the row and blocks selection when a reason is set", () => {
    const onRun = vi.fn();
    wrap(
      <ActionItem
        item={item({ disabledReason: "Pane limit" })}
        shortcutLabel={null}
        onRun={onRun}
      />,
    );
    const row = screen
      .getByText("New terminal")
      .closest("[cmdk-item]") as HTMLElement;
    expect(row.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(row);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("renders an icon when the item declares one", () => {
    // Baseline: the shared CommandItem always renders its check glyph.
    const bare = wrap(
      <ActionItem item={item()} shortcutLabel={null} onRun={() => {}} />,
    );
    const baseline = bare.container.querySelectorAll("svg").length;
    cleanup();
    const { container } = wrap(
      <ActionItem
        item={item({ icon: TerminalIcon })}
        shortcutLabel={null}
        onRun={() => {}}
      />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(baseline + 1);
  });
});

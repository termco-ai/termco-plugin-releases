// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { HashtagIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Snippet } from "../lib/snippets";

vi.mock("@termco/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@termco/ui")>()),
  PopoverContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

import { type PickerItem, SnippetPickerContent } from "./SnippetPicker";

afterEach(cleanup);

function buttonOf(el: HTMLElement): HTMLElement {
  const btn = el.closest("button");
  if (!btn) throw new Error("no button ancestor");
  return btn;
}

const CMD: PickerItem = {
  kind: "command",
  command: {
    name: "init",
    invocation: "/init",
    label: "Initialize workspace",
    icon: SparklesIcon,
  },
};

const CMD2: PickerItem = {
  kind: "command",
  command: {
    name: "plan",
    invocation: "/plan",
    label: "Plan mode",
    icon: HashtagIcon,
  },
};

function snippet(over: Partial<Snippet> = {}): PickerItem {
  return {
    kind: "snippet",
    snippet: {
      id: "s1",
      handle: "deploy",
      name: "Deploy",
      description: "How we deploy",
      content: "...",
      ...over,
    },
  };
}

function renderPicker(
  items: readonly PickerItem[],
  over: Partial<Parameters<typeof SnippetPickerContent>[0]> = {},
) {
  const props = {
    items,
    activeIndex: 0,
    onPick: vi.fn(),
    onHover: vi.fn(),
    ...over,
  };
  return { props, ...render(<SnippetPickerContent {...props} />) };
}

describe("SnippetPickerContent", () => {
  it("shows an empty state when nothing matches", () => {
    renderPicker([]);
    expect(
      screen.getByText(/No matches\. Add snippets in Settings/),
    ).toBeInTheDocument();
  });

  it("renders only the commands section when there are no snippets", () => {
    renderPicker([CMD]);
    expect(screen.getByText("Pre-built snippets")).toBeInTheDocument();
    expect(screen.queryByText("Snippets")).not.toBeInTheDocument();
    expect(screen.getByText("#init")).toBeInTheDocument();
    expect(screen.getByText("Initialize workspace")).toBeInTheDocument();
  });

  it("renders only the snippets section when there are no commands", () => {
    renderPicker([snippet()]);
    expect(screen.queryByText("Pre-built snippets")).not.toBeInTheDocument();
    expect(screen.getByText("Snippets")).toBeInTheDocument();
    expect(screen.getByText("#deploy")).toBeInTheDocument();
    expect(screen.getByText("How we deploy")).toBeInTheDocument();
  });

  it("omits the snippet description line when empty", () => {
    renderPicker([snippet({ description: "" })]);
    expect(screen.getByText("Deploy")).toBeInTheDocument();
    expect(screen.queryByText("How we deploy")).not.toBeInTheDocument();
  });

  it("highlights the active item across sections", () => {
    renderPicker([CMD, CMD2, snippet()], { activeIndex: 2 });
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).not.toHaveClass("bg-[var(--signal-soft)]");
    expect(buttons[1]).not.toHaveClass("bg-[var(--signal-soft)]");
    expect(buttons[2]).toHaveClass("bg-[var(--signal-soft)]");
  });

  it("picks the clicked item", () => {
    const { props } = renderPicker([CMD, snippet()]);
    fireEvent.click(screen.getByText("#deploy"));
    expect(props.onPick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "snippet" }),
    );
  });

  it("hovers report the global index, commands first", () => {
    const { props } = renderPicker([CMD, CMD2, snippet()]);
    fireEvent.mouseEnter(buttonOf(screen.getByText("#deploy")));
    expect(props.onHover).toHaveBeenCalledWith(2);
    fireEvent.mouseEnter(buttonOf(screen.getByText("#plan")));
    expect(props.onHover).toHaveBeenCalledWith(1);
  });
});

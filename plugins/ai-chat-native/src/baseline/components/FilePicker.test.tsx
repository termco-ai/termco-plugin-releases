// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@termco/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@termco/ui")>()),
  PopoverContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

vi.mock("../runtime/fileIcons", () => ({
  fileIconUrl: (name: string) => `icon:${name}`,
}));

import { FilePickerContent } from "./FilePicker";

afterEach(cleanup);

function buttonOf(el: HTMLElement): HTMLElement {
  const btn = el.closest("button");
  if (!btn) throw new Error("no button ancestor");
  return btn;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderPicker(
  over: Partial<Parameters<typeof FilePickerContent>[0]> = {},
) {
  const props = {
    files: [] as readonly string[],
    activeIndex: 0,
    indexing: false,
    truncated: false,
    hasWorkspace: true,
    onPick: vi.fn(),
    onHover: vi.fn(),
    ...over,
  };
  return { props, ...render(<FilePickerContent {...props} />) };
}

describe("FilePickerContent", () => {
  it("shows a hint when no workspace is open", () => {
    renderPicker({ hasWorkspace: false });
    expect(screen.getByText("No workspace open")).toBeInTheDocument();
  });

  it("shows the indexing spinner while the index is empty", () => {
    renderPicker({ indexing: true });
    expect(screen.getByText("Indexing workspace…")).toBeInTheDocument();
  });

  it("prefers results over the spinner while indexing", () => {
    renderPicker({ indexing: true, files: ["src/app.ts"] });
    expect(screen.queryByText("Indexing workspace…")).not.toBeInTheDocument();
    expect(screen.getByText("app.ts")).toBeInTheDocument();
  });

  it("shows a no-match hint for an empty result set", () => {
    renderPicker();
    expect(screen.getByText("No matching files")).toBeInTheDocument();
  });

  it("splits entries into name and directory", () => {
    renderPicker({ files: ["src/modules/app.ts", "README.md"] });
    expect(screen.getByText("app.ts")).toBeInTheDocument();
    expect(screen.getByText("src/modules")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("renders the file icon for each entry", () => {
    const { container } = renderPicker({ files: ["src/app.ts"] });
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "icon:app.ts",
    );
  });

  it("highlights the active row", () => {
    renderPicker({ files: ["a.ts", "b.ts"], activeIndex: 1 });
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).not.toHaveClass("bg-[var(--signal-soft)]");
    expect(buttons[1]).toHaveClass("bg-[var(--signal-soft)]");
  });

  it("scrolls the active row into view when the index changes", () => {
    const { props, rerender } = renderPicker({
      files: ["a.ts", "b.ts"],
      activeIndex: 0,
    });
    const spy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    spy.mockClear();
    rerender(<FilePickerContent {...props} activeIndex={1} />);
    expect(spy).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("picks a file and reports hover indexes", () => {
    const { props } = renderPicker({ files: ["a.ts", "src/b.ts"] });
    fireEvent.click(screen.getByText("b.ts"));
    expect(props.onPick).toHaveBeenCalledWith("src/b.ts");
    fireEvent.mouseEnter(buttonOf(screen.getByText("a.ts")));
    expect(props.onHover).toHaveBeenCalledWith(0);
  });

  it("shows the truncation hint for large workspaces", () => {
    renderPicker({ files: ["a.ts"], truncated: true });
    expect(
      screen.getByText(/Keep typing to narrow a large workspace/),
    ).toBeInTheDocument();
  });

  it("hides the truncation hint otherwise", () => {
    renderPicker({ files: ["a.ts"] });
    expect(screen.queryByText(/Workspace is large/)).not.toBeInTheDocument();
  });
});

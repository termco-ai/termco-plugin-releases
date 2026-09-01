// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorTab, Tab, TerminalTab } from "../../types";
import { TabIcon } from "./TabIcon";

const mocks = vi.hoisted(() => ({
  fileIconUrl: vi.fn((name: string) => `icon:${name}`),
}));

vi.mock("../../runtime", () => ({
  headerDependencies: () => ({ fileIcons: { fileIconUrl: mocks.fileIconUrl } }),
}));

afterEach(cleanup);

function terminal(over: Partial<TerminalTab> = {}): Tab {
  return {
    id: 1,
    kind: "terminal",
    rigId: "s",
    title: "shell",
    label: "shell",
    dirty: false,
    preview: false,
    private: false,
    ...over,
  };
}

function editor(over: Partial<EditorTab> = {}): Tab {
  return {
    id: 3,
    kind: "editor",
    rigId: "s",
    title: "foo.ts",
    label: "foo.ts",
    path: "/a/foo.ts",
    dirty: false,
    preview: false,
    private: false,
    ...over,
  };
}

describe("TabIcon", () => {
  it("renders a file-type image for editor tabs", () => {
    const { container } = render(<TabIcon tab={editor()} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(mocks.fileIconUrl("foo.ts"));
  });

  it("honours the language override for editor tabs", () => {
    const { container } = render(
      <TabIcon tab={editor({ overrideLanguage: "rs" })} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      mocks.fileIconUrl("dummy.rs"),
    );
  });

  it("falls back to the plain text icon when the image fails once", () => {
    const { container } = render(<TabIcon tab={editor()} />);
    const img = container.querySelector("img") as HTMLImageElement;
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(mocks.fileIconUrl("dummy.txt"));
    // A second failure must not loop.
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(mocks.fileIconUrl("dummy.txt"));
  });

  it("renders a file-type image for markdown tabs", () => {
    const md: Tab = {
      id: 4,
      kind: "markdown",
      rigId: "s",
      title: "README.md",
      label: "README.md",
      path: "/a/README.md",
      dirty: false,
      preview: false,
      private: false,
    };
    const { container } = render(<TabIcon tab={md} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      mocks.fileIconUrl("README.md"),
    );
  });

  it("renders a glyph for every non-file tab kind", () => {
    const tabs: Tab[] = [
      baseTab(5, "preview", "p"),
      baseTab(6, "ai-diff", "d", { path: "/a" }),
      terminal({ private: true }),
      baseTab(7, "git-diff", "g", { path: "/a" }),
      baseTab(8, "git-commit-file", "c", { path: "/a" }),
      baseTab(9, "git-history", "h"),
      terminal(),
    ];
    for (const tab of tabs) {
      const { container, unmount } = render(<TabIcon tab={tab} />);
      expect(container.querySelector("svg"), tab.kind).not.toBeNull();
      expect(container.querySelector("img")).toBeNull();
      unmount();
    }
  });
});

function baseTab(
  id: number,
  kind: string,
  title: string,
  extra: Partial<Tab> = {},
): Tab {
  return {
    id,
    kind,
    rigId: "s",
    title,
    label: title,
    dirty: false,
    preview: false,
    private: false,
    ...extra,
  };
}

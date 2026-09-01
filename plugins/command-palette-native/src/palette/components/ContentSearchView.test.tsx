// @vitest-environment jsdom
import { Command, CommandList } from "../../ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AsyncQueryState } from "../hooks/useAsyncQuery";
import type { ContentHit } from "../hooks/useContentSearch";
import { ContentSearchView } from "./ContentSearchView";

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

function content(
  overrides: Partial<AsyncQueryState<ContentHit>> = {},
): AsyncQueryState<ContentHit> {
  return {
    results: [],
    loading: false,
    error: null,
    retry: () => {},
    ...overrides,
  };
}

const HIT: ContentHit = {
  path: "/repo/src/app.ts",
  rel: "src/app.ts",
  line: 12,
  text: "  const answer = 42;",
};

function setup(props: Partial<Parameters<typeof ContentSearchView>[0]> = {}) {
  const onOpen = vi.fn();
  render(
    <Command>
      <CommandList>
        <ContentSearchView
          workspaceRoot={
            props.workspaceRoot === undefined ? "/repo" : props.workspaceRoot
          }
          term={props.term ?? "answer"}
          content={props.content ?? content()}
          onOpen={props.onOpen ?? onOpen}
          fileIcons={
            props.fileIcons ?? {
              fileIconUrl: (name) => `icon://${name}`,
              folderIconUrl: () => "folder://default",
            }
          }
        />
      </CommandList>
    </Command>,
  );
  return onOpen;
}

describe("ContentSearchView", () => {
  it("reports a missing workspace root", () => {
    setup({ workspaceRoot: null });
    expect(screen.getByText("No workspace root")).toBeDefined();
  });

  it("prompts for a longer query below the minimum", () => {
    setup({ term: "a" });
    expect(screen.getByText("Type at least 2 characters")).toBeDefined();
  });

  it("shows the empty label when nothing matches", () => {
    setup({ content: content() });
    expect(screen.getByText("No matches")).toBeDefined();
  });

  it("renders hits with trimmed text, location, and file icon", () => {
    setup({ content: content({ results: [HIT] }) });
    expect(screen.getByText("const answer = 42;")).toBeDefined();
    expect(screen.getByText("src/app.ts:12")).toBeDefined();
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe("icon://app.ts");
  });

  it("opens the picked hit at its line", () => {
    const onOpen = vi.fn();
    setup({ content: content({ results: [HIT] }), onOpen });
    fireEvent.click(
      screen
        .getByText("const answer = 42;")
        .closest("[cmdk-item]") as HTMLElement,
    );
    expect(onOpen).toHaveBeenCalledWith("/repo/src/app.ts", 12);
  });

  it("shows the searching state while loading", () => {
    setup({ content: content({ loading: true }) });
    expect(screen.getByText("Searching...")).toBeDefined();
  });
});

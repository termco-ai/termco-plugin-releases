// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorTab, Tab } from "../../types";
import { TabLanguageMenu } from "./TabLanguageMenu";

const languageMocks = vi.hoisted(() => ({
  all: [
    { name: "TypeScript", ext: "ts" },
    { name: "Rust", ext: "rs" },
    { name: "Python", ext: "py" },
  ],
}));
const ALL_LANGUAGES = languageMocks.all;
const EXPOSED_LANGUAGES = languageMocks.all.slice(0, 2);

vi.mock("../../runtime", () => ({
  headerDependencies: () => ({
    fileIcons: { fileIconUrl: (name: string) => `icon:${name}` },
    languages: {
      all: () => languageMocks.all,
      common: () => languageMocks.all.slice(0, 2),
      displayName: () => "TypeScript",
    },
  }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver =
  window.ResizeObserver ?? (ResizeObserverStub as typeof ResizeObserver);

const onOverrideLanguage = vi.fn();
const setShowAllLanguages = vi.fn();

function editor(over: Partial<EditorTab> = {}): Tab {
  return {
    id: 7,
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

function openMenu(tab: Tab = editor(), showAllLanguages = false) {
  render(
    <TabLanguageMenu
      tab={tab}
      showAllLanguages={showAllLanguages}
      setShowAllLanguages={setShowAllLanguages}
      onOverrideLanguage={onOverrideLanguage}
    />,
  );
  const trigger = screen.getByRole("button");
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 });
  fireEvent.click(trigger);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("TabLanguageMenu", () => {
  it("offers auto-detect with the resolved mode name", () => {
    openMenu();
    expect(screen.getByText("Auto Detect")).toBeTruthy();
    expect(screen.getByText(/^Mode:/).textContent).toContain("TypeScript");
  });

  it("clears the override via auto-detect", () => {
    openMenu(editor({ overrideLanguage: "rs" }));
    fireEvent.click(screen.getByText("Auto Detect"));
    expect(onOverrideLanguage).toHaveBeenCalledWith(7, null);
  });

  it("selects a language override by extension", () => {
    openMenu();
    const lang = EXPOSED_LANGUAGES[0];
    fireEvent.click(screen.getByText(lang.name));
    expect(onOverrideLanguage).toHaveBeenCalledWith(7, lang.ext);
  });

  it("shows the curated list by default and the full list on demand", () => {
    openMenu();
    const curatedCount = screen.getAllByRole("menuitem").length;
    expect(curatedCount).toBe(EXPOSED_LANGUAGES.length + 1);
    expect(screen.getByText(/Browse all/)).toBeTruthy();
    cleanup();

    openMenu(editor(), true);
    expect(screen.getAllByRole("menuitem").length).toBe(
      ALL_LANGUAGES.length + 1,
    );
    expect(screen.getByText(/Show common languages only/)).toBeTruthy();
  });

  it("toggles the full list without closing the menu", () => {
    openMenu();
    fireEvent.click(screen.getByText(/Browse all/));
    expect(setShowAllLanguages).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Auto Detect")).toBeTruthy();
  });
});

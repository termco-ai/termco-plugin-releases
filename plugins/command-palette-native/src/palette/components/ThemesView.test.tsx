// @vitest-environment jsdom
import { Command, CommandList } from "../../ui";
import type { ThemeDefinition } from "@termco/ui-theme-base";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemesView } from "./ThemesView";

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

const THEMES = [
  { id: "termco-default", name: "Termco" },
  { id: "nord", name: "Nord" },
] as unknown as ThemeDefinition[];

function setup(props: Partial<Parameters<typeof ThemesView>[0]> = {}) {
  const onExit = vi.fn();
  const onCommit = vi.fn();
  render(
    <Command>
      <CommandList>
        <ThemesView
          themes={props.themes ?? THEMES}
          themeId={props.themeId ?? "nord"}
          onExit={props.onExit ?? onExit}
          onCommit={props.onCommit ?? onCommit}
        />
      </CommandList>
    </Command>,
  );
  return { onExit, onCommit };
}

describe("ThemesView", () => {
  it("lists every theme plus a back row", () => {
    setup();
    expect(screen.getByText("Back")).toBeDefined();
    expect(screen.getByText("Termco")).toBeDefined();
    expect(screen.getByText("Nord")).toBeDefined();
  });

  it("exits via the back row", () => {
    const { onExit } = setup();
    fireEvent.click(
      screen.getByText("Back").closest("[cmdk-item]") as HTMLElement,
    );
    expect(onExit).toHaveBeenCalled();
  });

  it("commits the selected theme id", () => {
    const { onCommit } = setup();
    fireEvent.click(
      screen.getByText("Termco").closest("[cmdk-item]") as HTMLElement,
    );
    expect(onCommit).toHaveBeenCalledWith("termco-default");
  });

  it("marks only the active theme with a check", () => {
    setup({ themeId: "nord" });
    const active = screen.getByText("Nord").closest("[cmdk-item]");
    const inactive = screen.getByText("Termco").closest("[cmdk-item]");
    // Active row: built-in check + explicit tick; inactive: built-in only.
    expect(active?.querySelectorAll("svg").length).toBeGreaterThan(
      inactive?.querySelectorAll("svg").length ?? 0,
    );
  });

  it("shows a status row when no themes match the filter", () => {
    setup({ themes: [] });
    expect(screen.getByText("No themes")).toBeDefined();
  });
});

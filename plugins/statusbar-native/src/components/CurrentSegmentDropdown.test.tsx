// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentSegmentDropdown } from "./CurrentSegmentDropdown";

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

function setup(
  listSubdirs = vi.fn().mockResolvedValue([]),
  label = "repo",
  path = "/Users/dev/repo",
) {
  const onCd = vi.fn();
  render(
    <CurrentSegmentDropdown
      label={label}
      path={path}
      workspace={{ kind: "local" }}
      onCd={onCd}
      listSubdirs={listSubdirs}
    />,
  );
  return { listSubdirs, onCd };
}

function openMenu(label: string) {
  const trigger = screen.getByText(label);
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
}

describe("CurrentSegmentDropdown", () => {
  it("renders the current segment and Home presentation", () => {
    setup();
    expect(screen.getByText("repo")).toBeDefined();
    cleanup();
    setup(vi.fn().mockResolvedValue([]), "~", "/Users/dev");
    expect(screen.getByText("Home")).toBeDefined();
  });

  it("loads subfolders through the public workspace capability", async () => {
    const listSubdirs = vi.fn().mockResolvedValue(["src", "docs"]);
    setup(listSubdirs);
    openMenu("repo");
    expect(await screen.findByText("src")).toBeDefined();
    expect(screen.getByText("docs")).toBeDefined();
    expect(listSubdirs).toHaveBeenCalledWith("/Users/dev/repo", { kind: "local" });
  });

  it("descends without doubling a root separator", async () => {
    const { onCd } = setup(
      vi.fn().mockResolvedValue(["Users"]),
      "/",
      "/",
    );
    openMenu("/");
    const item = await screen.findByText("Users");
    fireEvent.click(item.closest("[role=menuitem]") as HTMLElement);
    expect(onCd).toHaveBeenCalledWith("/Users");
  });

  it("shows empty and error states", async () => {
    setup(vi.fn().mockResolvedValue([]));
    openMenu("repo");
    expect(await screen.findByText("No subfolders")).toBeDefined();
    cleanup();
    setup(vi.fn().mockRejectedValue("permission denied"));
    openMenu("repo");
    expect(await screen.findByText(/permission denied/)).toBeDefined();
  });
});

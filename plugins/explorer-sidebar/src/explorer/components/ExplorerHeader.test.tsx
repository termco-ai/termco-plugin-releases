// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExplorerHeader } from "./ExplorerHeader";

afterEach(cleanup);

function setup(rootPath = "/home/user/project") {
  const handlers = {
    onToggleSearch: vi.fn(),
    onNewFile: vi.fn(),
    onNewFolder: vi.fn(),
    onRefresh: vi.fn(),
  };
  render(<ExplorerHeader rootPath={rootPath} {...handlers} />);
  return handlers;
}

describe("ExplorerHeader", () => {
  it("shows the basename of the root path", () => {
    setup();
    expect(screen.getByText("project")).toBeDefined();
    expect(screen.getByTitle("/home/user/project")).toBeDefined();
  });

  it("shows the basename for windows paths", () => {
    setup("C:\\Users\\foo\\proj");
    expect(screen.getByText("proj")).toBeDefined();
  });

  it("wires all toolbar actions", () => {
    const handlers = setup();
    fireEvent.click(screen.getByLabelText("Search files"));
    expect(handlers.onToggleSearch).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("New file"));
    expect(handlers.onNewFile).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("New folder"));
    expect(handlers.onNewFolder).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Refresh"));
    expect(handlers.onRefresh).toHaveBeenCalled();
  });
});

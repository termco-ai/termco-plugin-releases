// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CwdBreadcrumb } from "./CwdBreadcrumb";

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

const listSubdirs = vi.fn().mockResolvedValue([]);

describe("CwdBreadcrumb", () => {
  it("shows a placeholder without a cwd", () => {
    render(
      <CwdBreadcrumb
        workspace={{ kind: "local" }}
        cwd={null}
        home="/Users/dev"
        onCd={() => {}}
        listSubdirs={listSubdirs}
      />,
    );
    expect(screen.getByText("no directory")).toBeDefined();
  });

  it("keeps the exact directory hierarchy and ancestor navigation", () => {
    const onCd = vi.fn();
    render(
      <CwdBreadcrumb
        workspace={{ kind: "local" }}
        cwd="/Users/dev/repo/src"
        home="/Users/dev"
        onCd={onCd}
        listSubdirs={listSubdirs}
      />,
    );
    expect(screen.getByText("Home")).toBeDefined();
    expect(screen.getByText("repo")).toBeDefined();
    expect(screen.getByText("src")).toBeDefined();
    fireEvent.click(screen.getByText("Home").closest("button") as HTMLElement);
    expect(onCd).toHaveBeenCalledWith("/Users/dev");
    fireEvent.click(screen.getByText("repo").closest("button") as HTMLElement);
    expect(onCd).toHaveBeenCalledWith("/Users/dev/repo");
  });

  it("renders file mode with a static filename and navigable directories", () => {
    const onCd = vi.fn();
    render(
      <CwdBreadcrumb
        workspace={{ kind: "local" }}
        cwd="/Users/dev/repo"
        filePath="/Users/dev/repo/src/main.ts"
        home="/Users/dev"
        onCd={onCd}
        listSubdirs={listSubdirs}
      />,
    );
    expect(screen.getByText("main.ts")).toBeDefined();
    fireEvent.click(screen.getByText("src").closest("button") as HTMLElement);
    expect(onCd).toHaveBeenCalledWith("/Users/dev/repo/src");
  });

  it("handles Windows file paths", () => {
    render(
      <CwdBreadcrumb
        workspace={{ kind: "local" }}
        cwd={null}
        filePath="C:\\repo\\main.ts"
        home={null}
        onCd={() => {}}
        listSubdirs={listSubdirs}
      />,
    );
    expect(screen.getByText("main.ts")).toBeDefined();
    expect(screen.getByText("C:")).toBeDefined();
    expect(screen.getByText("repo")).toBeDefined();
  });

  it("shows the stable macOS display path instead of the /private realpath", () => {
    render(
      <CwdBreadcrumb
        workspace={{ kind: "local" }}
        cwd="/private/var/folders/project"
        home={null}
        onCd={() => {}}
        listSubdirs={listSubdirs}
      />,
    );
    expect(screen.queryByText("private")).toBeNull();
    expect(screen.getByText("var")).toBeDefined();
    expect(screen.getByText("project")).toBeDefined();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStatusbarRuntime } from "../testRuntime";
import { WorkspaceEnvSelector } from "./WorkspaceEnvSelector";

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

function openMenu() {
  const trigger = screen.getByTitle("Workspace environment");
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
}

describe("WorkspaceEnvSelector", () => {
  it("renders nothing off Windows", () => {
    const { container } = render(
      <WorkspaceEnvSelector runtime={createStatusbarRuntime()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("labels local and WSL environments", () => {
    const { rerender } = render(
      <WorkspaceEnvSelector
        runtime={createStatusbarRuntime({ platform: "windows" })}
      />,
    );
    expect(screen.getByText("Windows")).toBeDefined();
    rerender(
      <WorkspaceEnvSelector
        runtime={createStatusbarRuntime({
          platform: "windows",
          workspace: { kind: "wsl", distro: "Ubuntu" },
        })}
      />,
    );
    expect(screen.getByText("WSL: Ubuntu")).toBeDefined();
  });

  it("refreshes on first open and switches environments", async () => {
    const runtime = createStatusbarRuntime({
      platform: "windows",
      wslDistros: [{ name: "Debian", default: false, running: false }],
    });
    render(<WorkspaceEnvSelector runtime={runtime} />);
    openMenu();
    fireEvent.click(
      (await screen.findByText("Debian")).closest("[role=menuitem]") as HTMLElement,
    );
    expect(runtime.changeWorkspace).toHaveBeenCalledWith({
      kind: "wsl",
      distro: "Debian",
    });
  });

  it("requests distros only when none are already loaded", () => {
    const runtime = createStatusbarRuntime({ platform: "windows" });
    render(<WorkspaceEnvSelector runtime={runtime} />);
    openMenu();
    expect(runtime.refreshWslDistros).toHaveBeenCalledOnce();
  });

  it("restores loading, unavailable, and empty rows", async () => {
    render(
      <WorkspaceEnvSelector
        runtime={createStatusbarRuntime({
          platform: "windows",
          wslLoading: true,
        })}
      />,
    );
    openMenu();
    expect(await screen.findByText("Loading WSL distros...")).toBeDefined();
    cleanup();
    render(
      <WorkspaceEnvSelector
        runtime={createStatusbarRuntime({
          platform: "windows",
          wslError: "wsl missing",
        })}
      />,
    );
    openMenu();
    expect(await screen.findByText("WSL unavailable")).toBeDefined();
  });
});

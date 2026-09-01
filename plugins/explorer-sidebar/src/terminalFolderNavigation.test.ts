import { describe, expect, it, vi } from "vitest";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type {
  UiSidebarNavigationCapability,
  UiSidebarViewController,
} from "@termco/ui-sidebar-base";
import { TERMINAL_BLOCK_EVENTS } from "@termco/terminal-base";
import { installTerminalFolderNavigation } from "./renderer";

function setup(root = "/repo") {
  let listener: ((payload: unknown) => void) | null = null;
  const events = {
    subscribe: vi.fn((event: string, next: (payload: unknown) => void) => {
      expect(event).toBe(TERMINAL_BLOCK_EVENTS.openFolder);
      listener = next;
      return vi.fn();
    }),
  } as unknown as ApplicationEventsCapability;
  const navigation = { select: vi.fn() } as unknown as UiSidebarNavigationCapability;
  const controller = { revealPath: vi.fn() } as unknown as UiSidebarViewController;
  const desktop = { revealItem: vi.fn() } as unknown as DesktopIntegrationCapability;
  installTerminalFolderNavigation(events, navigation, controller, () => root, desktop);
  return {
    emit: (payload: unknown) => listener?.(payload),
    navigation,
    controller,
    desktop,
  };
}

describe("terminal block folder navigation", () => {
  it("reveals a path under a '/' explorer root in the sidebar", () => {
    const result = setup("/");
    result.emit({
      path: "/boot",
      env: { kind: "ssh", connectionId: "ssh-1", host: "host" },
    });
    expect(result.navigation.select).toHaveBeenCalledWith("explorer");
    expect(result.controller.revealPath).toHaveBeenCalledWith("/boot");
    expect(result.desktop.revealItem).not.toHaveBeenCalled();
  });

  it("reveals folders below the selected Explorer root", () => {
    const result = setup();
    result.emit({ path: "/repo/src", env: { kind: "local" } });
    expect(result.navigation.select).toHaveBeenCalledWith("explorer");
    expect(result.controller.revealPath).toHaveBeenCalledWith("/repo/src");
    expect(result.desktop.revealItem).not.toHaveBeenCalled();
  });

  it("never sends a remote terminal path to the local file manager", () => {
    const result = setup();
    result.emit({
      path: "/remote/project",
      env: { kind: "ssh", connectionId: "ssh-1", host: "host" },
    });
    expect(result.controller.revealPath).not.toHaveBeenCalled();
    expect(result.desktop.revealItem).not.toHaveBeenCalled();
  });

  it("keeps the Finder fallback for local paths outside the root", () => {
    const result = setup("/Users/x/project");
    result.emit({
      path: "/Users/x/elsewhere",
      env: { kind: "local" },
    });
    expect(result.controller.revealPath).not.toHaveBeenCalled();
    expect(result.desktop.revealItem).toHaveBeenCalledWith(
      "/Users/x/elsewhere",
    );
  });

  it("treats an env-less event (legacy dispatch) as local", () => {
    const result = setup("/Users/x/project");
    result.emit({ path: "/Users/x/elsewhere" });
    expect(result.controller.revealPath).not.toHaveBeenCalled();
    expect(result.desktop.revealItem).toHaveBeenCalledWith(
      "/Users/x/elsewhere",
    );
  });
});

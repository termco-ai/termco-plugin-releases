// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../store/store";
import { AiDockSurface } from "./AiSurfaces";

const mocks = vi.hoisted(() => ({
  openSettingsWindow: vi.fn(async () => {}),
}));

vi.mock("../baseline/runtime/settings", () => ({
  openSettingsWindow: mocks.openSettingsWindow,
}));

vi.mock("../baseline/components/AiDockPanel/AiDockPanel", () => ({
  AiDockPanel: () => <div data-testid="chat-dock">Chat composer</div>,
}));

beforeEach(() => {
  useChatStore.setState(useChatStore.getInitialState(), true);
  useChatStore.setState({ keysLoaded: true, panelOpen: true });
  mocks.openSettingsWindow.mockClear();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AI dock provider setup", () => {
  it("expands up to the sidebar, then shrinks again without replacing the composer", () => {
    const workspace = document.createElement("div");
    workspace.setAttribute("data-workspace-surface", "true");
    document.body.append(workspace);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this === workspace ? new DOMRect(280, 80, 536, 600) : new DOMRect(816, 80, 384, 600);
    });
    useChatStore.setState({ apiKeys: { ...useChatStore.getState().apiKeys, openai: "configured" } });
    const { container } = render(<AiDockSurface />);
    const composer = screen.getByTestId("chat-dock");
    const handle = screen.getByRole("separator", { name: "Resize AI panel" });
    const panel = container.querySelector<HTMLElement>('[data-onboarding-target="ai-chat.panel"]')!;
    expect(handle).toHaveAttribute("aria-valuemax", "920");
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 816 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(panel.style.width).toBe("920px");
    expect(panel.style.marginLeft).toBe("-536px");
    expect(screen.getByTestId("chat-dock")).toBe(composer);
    fireEvent.keyDown(handle, { key: "Home" });
    expect(panel.style.width).toBe("360px");
    expect(panel.style.marginLeft).toBe("0px");
    fireEvent.keyDown(handle, { key: "End" });
    expect(panel.style.width).toBe("920px");
    workspace.remove();
  });

  it("replaces Chat controls with a provider setup action until a provider is ready", () => {
    render(<AiDockSurface />);

    expect(screen.getByRole("heading", { name: "Connect a provider to start" }))
      .toBeInTheDocument();
    expect(screen.queryByTestId("chat-dock")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure providers" }));
    expect(mocks.openSettingsWindow).toHaveBeenCalledWith("models");

    act(() => {
      useChatStore.setState({
        apiKeys: {
          ...useChatStore.getState().apiKeys,
          openai: "configured",
        },
      });
    });

    expect(screen.getByTestId("chat-dock")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect a provider to start" }))
      .not.toBeInTheDocument();
  });
});

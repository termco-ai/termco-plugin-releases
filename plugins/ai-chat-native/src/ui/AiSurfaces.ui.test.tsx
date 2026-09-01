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
});

afterEach(cleanup);

describe("AI dock provider setup", () => {
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

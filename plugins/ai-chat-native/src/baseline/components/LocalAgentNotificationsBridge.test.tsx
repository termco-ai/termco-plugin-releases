// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { routeMock, setLocalAgentMock } = vi.hoisted(() => ({
  routeMock: vi.fn(),
  setLocalAgentMock: vi.fn(),
}));

vi.mock("../runtime/localAgentNotifications", async () => ({
  ...(await vi.importActual("../runtime/localAgentNotifications")),
  routeAgentNotification: routeMock,
  setLocalAgent: setLocalAgentMock,
}));

vi.mock("../store/chatStore", async () => {
  const { create } = await import("zustand");
  type MockState = {
    agentMeta: { status: string; error: string | null };
    panelOpen: boolean;
    mini: { open: boolean };
    openPanel: () => void;
  };
  const useChatStore = create<MockState>((set) => ({
    agentMeta: { status: "idle", error: null },
    panelOpen: false,
    mini: { open: false },
    openPanel: () => set({ panelOpen: true }),
  }));
  return { useChatStore };
});

import { useChatStore } from "../store/chatStore";
import { LocalAgentNotificationsBridge } from "./LocalAgentNotificationsBridge";

afterEach(cleanup);

function setStatus(status: string, error: string | null = null) {
  act(() => {
    useChatStore.setState({ agentMeta: { status, error } } as never);
  });
}

beforeEach(() => {
  routeMock.mockReset();
  setLocalAgentMock.mockReset();
  useChatStore.setState({
    agentMeta: { status: "idle", error: null },
    panelOpen: false,
    mini: { open: false },
  } as never);
});

describe("LocalAgentNotificationsBridge", () => {
  it("mirrors busy statuses into the agent store", () => {
    render(<LocalAgentNotificationsBridge />);
    expect(setLocalAgentMock).toHaveBeenLastCalledWith(null);

    setStatus("thinking");
    expect(setLocalAgentMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ agent: "Termco", status: "working" }),
    );

    setStatus("streaming");
    expect(setLocalAgentMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ agent: "Termco", status: "working" }),
    );

    setStatus("awaiting-approval");
    expect(setLocalAgentMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ agent: "Termco", status: "waiting" }),
    );

    setStatus("idle");
    expect(setLocalAgentMock).toHaveBeenLastCalledWith(null);
  });

  it("does not notify while merely working", () => {
    render(<LocalAgentNotificationsBridge />);
    setStatus("thinking");
    setStatus("streaming");
    expect(routeMock).not.toHaveBeenCalled();
  });

  it("fires an attention notification when approval is needed", () => {
    render(<LocalAgentNotificationsBridge />);
    setStatus("thinking");
    setStatus("awaiting-approval");
    expect(routeMock).toHaveBeenCalledTimes(1);
    expect(routeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "Termco",
        kind: "attention",
        title: "Termco needs your approval",
      }),
    );
  });

  it("fires a finished notification when a busy run goes idle", () => {
    render(<LocalAgentNotificationsBridge />);
    setStatus("streaming");
    setStatus("idle");
    expect(routeMock).toHaveBeenCalledTimes(1);
    expect(routeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "finished",
        title: "Termco finished",
      }),
    );
  });

  it("does not fire finished when idle follows a non-busy status", () => {
    render(<LocalAgentNotificationsBridge />);
    setStatus("error", "boom");
    routeMock.mockClear();
    setStatus("idle");
    expect(routeMock).not.toHaveBeenCalled();
  });

  it("fires an error notification with the stored error body", () => {
    render(<LocalAgentNotificationsBridge />);
    setStatus("streaming");
    setStatus("error", "rate limited");
    expect(routeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "error",
        title: "Termco run failed",
        body: "rate limited",
      }),
    );
  });

  it("passes current visibility to the provider-owned router", () => {
    render(<LocalAgentNotificationsBridge />);
    act(() => {
      useChatStore.setState({ panelOpen: true } as never);
    });
    setStatus("awaiting-approval");
    expect(routeMock).toHaveBeenCalledWith(
      expect.objectContaining({ visible: true }),
    );
  });

  it("treats the mini window as visibility too", () => {
    render(<LocalAgentNotificationsBridge />);
    act(() => {
      useChatStore.setState({ mini: { open: true } } as never);
    });
    setStatus("awaiting-approval");
    expect(routeMock).toHaveBeenCalledWith(
      expect.objectContaining({ visible: true }),
    );
  });

  it("opens the panel when a notification is activated", () => {
    render(<LocalAgentNotificationsBridge />);
    setStatus("awaiting-approval");
    const { activate } = routeMock.mock.calls[0][0];
    act(() => activate());
    expect(useChatStore.getState().panelOpen).toBe(true);
  });

  it("clears the shared local-agent state when the producer unmounts", () => {
    const view = render(<LocalAgentNotificationsBridge />);
    setStatus("thinking");
    setLocalAgentMock.mockClear();
    view.unmount();
    expect(setLocalAgentMock).toHaveBeenCalledExactlyOnceWith(null);
  });
});

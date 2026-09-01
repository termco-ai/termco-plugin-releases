// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSelectionAskAi } from "./useSelectionAskAi";

function mouse(type: string, target: Element, x = 10, y = 20) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
  );
}

describe("plugin-owned selection Ask AI", () => {
  let terminal: HTMLDivElement;
  let outside: HTMLDivElement;
  const selection = { text: "selected text", source: "terminal" as const };

  beforeEach(() => {
    vi.useFakeTimers();
    terminal = document.createElement("div");
    terminal.className = "terminal-host";
    outside = document.createElement("div");
    document.body.append(terminal, outside);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("preserves coordinates, source, and ask behavior", () => {
    const capture = vi.fn(() => selection);
    const ask = vi.fn();
    const { result } = renderHook(() => useSelectionAskAi(capture, ask));
    mouse("mouseup", terminal, 42, 84);
    act(() => vi.runAllTimers());
    expect(result.current.popup).toEqual({ x: 42, y: 84, selection });
    act(() => result.current.ask());
    expect(ask).toHaveBeenCalledWith(selection);
    expect(result.current.popup).toBeNull();
  });

  it("exposes the popup state from useSelectionAskAi", () => {
    const capture = vi.fn(() => selection);
    const { result } = renderHook(() => useSelectionAskAi(capture, vi.fn()));
    mouse("mouseup", terminal, 15, 25);
    act(() => vi.runAllTimers());
    expect(result.current.popup).toEqual({ x: 15, y: 25, selection });
  });

  it("reports a closed presence while no popup is shown", () => {
    const { result } = renderHook(() =>
      useSelectionAskAi(() => null, vi.fn()),
    );
    expect(result.current.popup).toBeNull();
  });

  it("ignores unrelated surfaces, dismisses outside, and cleans up", () => {
    const capture = vi.fn(() => selection);
    const view = renderHook(() => useSelectionAskAi(capture, vi.fn()));
    mouse("mouseup", outside);
    act(() => vi.runAllTimers());
    expect(capture).not.toHaveBeenCalled();
    mouse("mouseup", terminal);
    act(() => vi.runAllTimers());
    expect(view.result.current.popup).not.toBeNull();
    act(() => mouse("mousedown", outside));
    expect(view.result.current.popup).toBeNull();
    view.unmount();
    mouse("mouseup", terminal);
    act(() => vi.runAllTimers());
    expect(capture).toHaveBeenCalledOnce();
  });
});

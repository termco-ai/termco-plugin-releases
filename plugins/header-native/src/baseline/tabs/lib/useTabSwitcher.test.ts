// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTabSwitcher } from "./useTabSwitcher";

afterEach(cleanup);

const onCommit = vi.fn();
let order: number[] = [];

function mount() {
  return renderHook(() => useTabSwitcher({ getOrder: () => order, onCommit }));
}

function keyUp(init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keyup", init));
}

beforeEach(() => {
  onCommit.mockClear();
  order = [10, 20, 30];
});

describe("step", () => {
  it("opens on the second entry when stepping forward", () => {
    const { result } = mount();
    act(() => result.current.step(1));
    expect(result.current.state).toEqual({ order: [10, 20, 30], index: 1 });
  });

  it("opens on the last entry when stepping backward", () => {
    const { result } = mount();
    act(() => result.current.step(-1));
    expect(result.current.state).toEqual({ order: [10, 20, 30], index: 2 });
  });

  it("wraps around in both directions", () => {
    const { result } = mount();
    act(() => result.current.step(1));
    act(() => result.current.step(1));
    act(() => result.current.step(1));
    expect(result.current.state?.index).toBe(0);
    act(() => result.current.step(-1));
    expect(result.current.state?.index).toBe(2);
  });

  it("stays closed with fewer than two candidates", () => {
    order = [10];
    const { result } = mount();
    act(() => result.current.step(1));
    expect(result.current.state).toBeNull();
  });
});

describe("commit via modifier release", () => {
  it("commits the selected tab on a bare keyup", () => {
    const { result } = mount();
    act(() => result.current.step(1));
    act(() => keyUp());
    expect(onCommit).toHaveBeenCalledWith(20);
    expect(result.current.state).toBeNull();
  });

  it("does not commit while a modifier is still held", () => {
    const { result } = mount();
    act(() => result.current.step(1));
    act(() => keyUp({ ctrlKey: true }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.state).not.toBeNull();
  });

  it("skips the commit when the selection is the current tab", () => {
    const { result } = mount();
    act(() => result.current.step(1));
    act(() => result.current.step(-1));
    expect(result.current.state?.index).toBe(0);
    act(() => keyUp());
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();
  });

  it("ignores keyup when the switcher is closed", () => {
    mount();
    act(() => keyUp());
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("cancel", () => {
  it("cancels on Escape without committing", () => {
    const { result } = mount();
    act(() => result.current.step(1));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.state).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("cancels when the window blurs", () => {
    const { result } = mount();
    act(() => result.current.step(1));
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(result.current.state).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("removes its listeners on unmount", () => {
    const { result, unmount } = mount();
    act(() => result.current.step(1));
    unmount();
    keyUp();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

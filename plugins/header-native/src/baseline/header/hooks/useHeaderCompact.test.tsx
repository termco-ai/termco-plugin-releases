// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHeaderCompact } from "./useHeaderCompact";

type ROCallback = (entries: { contentRect: { width: number } }[]) => void;

let observed: Element[] = [];
let callback: ROCallback | null = null;
const disconnect = vi.fn();

class FakeResizeObserver {
  constructor(cb: ROCallback) {
    callback = cb;
  }
  observe(el: Element) {
    observed.push(el);
  }
  disconnect() {
    disconnect();
  }
  unobserve() {}
}

function Probe() {
  const { rootRef, compact } = useHeaderCompact();
  return (
    <div ref={rootRef} data-testid="root" data-compact={String(compact)} />
  );
}

beforeEach(() => {
  observed = [];
  callback = null;
  disconnect.mockClear();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fireWidth(width: number) {
  act(() => {
    callback?.([{ contentRect: { width } }]);
  });
}

afterEach(cleanup);

describe("useHeaderCompact", () => {
  it("observes the root element and starts non-compact", () => {
    render(<Probe />);
    expect(observed).toContain(screen.getByTestId("root"));
    expect(screen.getByTestId("root").dataset.compact).toBe("false");
  });

  it("turns compact below the width threshold", () => {
    render(<Probe />);
    fireWidth(899);
    expect(screen.getByTestId("root").dataset.compact).toBe("true");
  });

  it("stays regular at or above the threshold", () => {
    render(<Probe />);
    fireWidth(900);
    expect(screen.getByTestId("root").dataset.compact).toBe("false");
  });

  it("treats a missing entry as width 0 (compact)", () => {
    render(<Probe />);
    act(() => {
      callback?.([]);
    });
    expect(screen.getByTestId("root").dataset.compact).toBe("true");
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});

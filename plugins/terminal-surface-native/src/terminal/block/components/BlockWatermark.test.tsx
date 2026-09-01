// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockWatermarkState } from "../../lib/useTerminalSession";
import { BlockWatermark } from "./BlockWatermark";

vi.mock("../../lib/useTerminalSession", () => ({
  blockWatermarkState: vi.fn(() => "visible"),
}));

vi.mock("../../../shortcuts", () => ({
  useShortcutLabel: vi.fn(() => "Ctrl U"),
}));

const state = vi.mocked(blockWatermarkState);

function mount(subscribe: (callback: () => void) => () => void = () => () => {}) {
  return render(<BlockWatermark leafId={1} subscribe={subscribe} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.mockReturnValue("visible");
});

afterEach(cleanup);

describe("BlockWatermark", () => {
  it("shows the hints fully opaque when visible", () => {
    const { container } = mount();
    const overlay = container.firstElementChild;
    expect(overlay?.className).toContain("opacity-100");
    expect(overlay?.textContent).toContain("Browse your command history");
    expect(overlay?.textContent).toContain("Ctrl");
  });

  it("fades out while hidden but stays mounted", () => {
    state.mockReturnValue("hidden");
    const { container } = mount();
    const overlay = container.firstElementChild;
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain("opacity-0");
  });

  it("re-renders from the subscription when the state changes", () => {
    let notify: (() => void) | null = null;
    const { container } = mount((callback) => {
      notify = callback;
      return () => {};
    });
    expect(container.firstElementChild?.className).toContain("opacity-100");
    state.mockReturnValue("hidden");
    act(() => notify?.());
    expect(container.firstElementChild?.className).toContain("opacity-0");
  });

  it("unmounts for good 600ms after the leaf dies", () => {
    vi.useFakeTimers();
    try {
      state.mockReturnValue("dead");
      const { container } = mount();
      expect(container.firstElementChild).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(container.firstElementChild).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops its subscription once gone", () => {
    vi.useFakeTimers();
    try {
      const unsubscribe = vi.fn();
      state.mockReturnValue("dead");
      mount(() => unsubscribe);
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(unsubscribe).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not schedule the removal while visible", () => {
    vi.useFakeTimers();
    try {
      const { container } = mount();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(container.firstElementChild).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

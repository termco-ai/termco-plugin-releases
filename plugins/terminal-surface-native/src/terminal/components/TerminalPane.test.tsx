// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalSession } from "../lib/useTerminalSession";
import { TerminalPane, type TerminalPaneHandle } from "./TerminalPane";

const session = vi.hoisted(() => ({
  write: vi.fn(),
  focus: vi.fn(),
  getBuffer: vi.fn(() => "buffer"),
  getSelection: vi.fn(() => "sel"),
  applyTheme: vi.fn(),
  blockMode: "prompt" as string,
  selectBlockAt: vi.fn(),
  readBlockId: vi.fn(),
  subscribeBlocks: vi.fn(() => () => {}),
  visibleBlocks: vi.fn(() => ({ blocks: [], sticky: null })),
  searchBlock: vi.fn(() => []),
  revealMatch: vi.fn(),
  clearSearch: vi.fn(),
}));

vi.mock("../lib/useTerminalSession", () => ({
  useTerminalSession: vi.fn(() => session),
}));

vi.mock("../../theme", () => ({
  useTheme: vi.fn(() => ({
    resolvedMode: "dark",
    themeId: "termco-default",
    customThemes: [],
  })),
}));

const layoutProps = vi.hoisted(() => ({ last: null as unknown }));
vi.mock("./BlockPaneLayout", () => ({
  BlockPaneLayout: (props: { leafId: number; promptReady: boolean }) => {
    layoutProps.last = props;
    return <div data-testid="block-layout" data-leaf={props.leafId} />;
  },
}));

const useSessionMock = vi.mocked(useTerminalSession);
const workspace = { kind: "local" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  session.blockMode = "prompt";
  useSessionMock.mockReturnValue(session as never);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TerminalPane", () => {
  it("renders the plain terminal surface and hides it when invisible", () => {
    const { container, rerender } = render(
      <TerminalPane leafId={1} workspace={workspace} visible />,
    );
    const surface = container.firstElementChild as HTMLElement;
    expect(surface.className).toContain("zoom-exempt");
    expect(surface.className).toContain("px-2");
    expect(surface.className).not.toContain("py-");
    expect(surface).not.toHaveClass("border");
    expect(surface.firstElementChild).toHaveClass("h-full", "w-full");
    expect(surface.style.visibility).toBe("visible");
    expect(surface.style.pointerEvents).toBe("auto");
    rerender(
      <TerminalPane leafId={1} workspace={workspace} visible={false} />,
    );
    expect(surface.style.visibility).toBe("hidden");
    expect(surface.style.pointerEvents).toBe("none");
  });

  it("passes its wiring into useTerminalSession", () => {
    const onCwd = vi.fn();
    const onExit = vi.fn();
    const onSearchReady = vi.fn();
    render(
      <TerminalPane
        leafId={9}
        workspace={workspace}
        visible
        focused={false}
        initialCwd="/seed"
        onCwd={onCwd}
        onExit={onExit}
        onSearchReady={onSearchReady}
      />,
    );
    const options = useSessionMock.mock.calls[0][0];
    expect(options).toMatchObject({
      leafId: 9,
      workspace,
      visible: true,
      focused: false,
      initialCwd: "/seed",
      blocks: false,
    });
    options.onCwd?.("/next");
    expect(onCwd).toHaveBeenCalledWith(9, "/next");
    options.onExit?.(3);
    expect(onExit).toHaveBeenCalledWith(9, 3);
    const addon = {} as never;
    options.onSearchReady?.(addon);
    expect(onSearchReady).toHaveBeenCalledWith(9, addon);
  });

  it("applies the theme on mount via a deferred frame", () => {
    render(<TerminalPane leafId={1} workspace={workspace} visible />);
    expect(session.applyTheme).toHaveBeenCalled();
  });

  it("exposes an imperative handle that delegates to the session", () => {
    const ref = createRef<TerminalPaneHandle>();
    render(
      <TerminalPane leafId={1} workspace={workspace} visible ref={ref} />,
    );
    ref.current?.write("data");
    expect(session.write).toHaveBeenCalledWith("data");
    ref.current?.focus();
    expect(session.focus).toHaveBeenCalled();
    expect(ref.current?.getBuffer(50)).toBe("buffer");
    expect(session.getBuffer).toHaveBeenCalledWith(50);
    expect(ref.current?.getSelection()).toBe("sel");
  });

  it("renders the block layout when blocks are enabled", () => {
    session.blockMode = "running";
    const { getByTestId } = render(
      <TerminalPane leafId={4} workspace={workspace} visible blocks />,
    );
    expect(getByTestId("block-layout").dataset.leaf).toBe("4");
    expect(layoutProps.last).toMatchObject({
      leafId: 4,
      promptReady: false,
    });
  });

  it("reports promptReady to the block layout at the prompt", () => {
    session.blockMode = "prompt";
    render(
      <TerminalPane leafId={4} workspace={workspace} visible blocks />,
    );
    expect(layoutProps.last).toMatchObject({ promptReady: true });
  });
});

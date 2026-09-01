// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  focusLeafInput,
  type useTerminalSession,
} from "../lib/useTerminalSession";
import { BlockPaneLayout } from "./BlockPaneLayout";

vi.mock("../lib/useTerminalSession", () => ({
  focusLeafInput: vi.fn(),
  submitToLeaf: vi.fn(),
}));

const overlayProps = vi.hoisted(() => ({ last: null as unknown }));

vi.mock("../block/components/BlockOverlay", () => ({
  BlockOverlay: (props: Record<string, unknown>) => {
    overlayProps.last = props;
    return <div data-testid="overlay" />;
  },
}));

vi.mock("../block/components/BlockWatermark", () => ({
  BlockWatermark: ({ leafId }: { leafId: number }) => (
    <div data-testid="watermark" data-leaf={leafId} />
  ),
}));

const portalProps = vi.hoisted(() => ({ last: null as unknown }));

vi.mock("../block/components/portal/BlockPortals", () => ({
  BlockPortals: (props: Record<string, unknown>) => {
    portalProps.last = props;
    return <div data-testid="portals" />;
  },
}));

type Session = ReturnType<typeof useTerminalSession>;

function makeSession(over: Partial<Session> = {}): Session {
  return {
    write: vi.fn(),
    focus: vi.fn(),
    getBuffer: vi.fn(),
    getSelection: vi.fn(),
    applyTheme: vi.fn(),
    blockMode: "prompt",
    selectBlockAt: vi.fn(),
    readBlockId: vi.fn(() => ({ output: "block out" })),
    readBlockMeta: vi.fn(() => null),
    subscribeBlocks: vi.fn(() => () => {}),
    visibleBlocks: vi.fn(() => ({ blocks: [], sticky: null })),
    searchBlock: vi.fn(() => []),
    revealMatch: vi.fn(),
    clearSearch: vi.fn(),
    ...over,
  } as unknown as Session;
}

function mount(session: Session) {
  const containerRef = createRef<HTMLDivElement | null>();
  const downYRef = { current: null as number | null };
  const utils = render(
    <BlockPaneLayout
      leafId={5}
      session={session}
      containerRef={containerRef}
      downYRef={downYRef}
      hideStyle={{ visibility: "visible" }}
      promptReady
    />,
  );
  const surface = containerRef.current;
  if (!surface) throw new Error("container ref not attached");
  return { ...utils, surface, downYRef };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("BlockPaneLayout", () => {
  it("pads the terminal horizontally without reducing its height", () => {
    const { surface } = mount(makeSession());
    const wrapper = surface.closest("[data-terminal-padding]");
    expect(wrapper).toHaveClass("px-2");
    expect(wrapper?.className).not.toContain("py-");
    expect(wrapper).not.toHaveClass("border");
  });

  it("renders the watermark, portals and search overlay for the leaf", () => {
    const session = makeSession();
    const { getByTestId } = mount(session);
    expect(getByTestId("watermark").dataset.leaf).toBe("5");
    expect(getByTestId("overlay")).toBeInTheDocument();
    expect(getByTestId("portals")).toBeInTheDocument();
    const portals = portalProps.last as {
      leafId: number;
      promptReady: boolean;
    };
    expect(portals.leafId).toBe(5);
    expect(portals.promptReady).toBe(true);
  });

  it("refocuses the docked input on a stationary click at the prompt", () => {
    const { surface } = mount(makeSession());
    fireEvent.mouseDown(surface, { clientY: 100 });
    fireEvent.mouseUp(surface, { clientY: 102 });
    expect(focusLeafInput).toHaveBeenCalledWith(5);
  });

  it("treats a drag as a text selection, keeping focus untouched", () => {
    const { surface } = mount(makeSession());
    fireEvent.mouseDown(surface, { clientY: 100 });
    fireEvent.mouseUp(surface, { clientY: 140 });
    expect(focusLeafInput).not.toHaveBeenCalled();
  });

  it("does not steal focus while a command is running", () => {
    const session = makeSession({ blockMode: "running" } as Partial<Session>);
    const { surface } = mount(session);
    fireEvent.mouseDown(surface, { clientY: 10 });
    fireEvent.mouseUp(surface, { clientY: 10 });
    expect(focusLeafInput).not.toHaveBeenCalled();
  });

  it("wires the search overlay to the session", () => {
    const session = makeSession();
    mount(session);
    const props = overlayProps.last as {
      leafId: number;
      searchBlock: unknown;
      revealMatch: unknown;
      clearSearch: unknown;
    };
    expect(props.leafId).toBe(5);
    expect(props.searchBlock).toBe(session.searchBlock);
    expect(props.revealMatch).toBe(session.revealMatch);
    expect(props.clearSearch).toBe(session.clearSearch);
  });
});

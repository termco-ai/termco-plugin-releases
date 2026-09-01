// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ExplorerSearchHandle } from "./ExplorerSearch";
import { ExplorerSearch } from "./ExplorerSearch";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../../testRuntime";

type Hit = { path: string; rel: string; name: string; is_dir: boolean };
let runtime: ExplorerRuntimeMocks;

function hits(list: Hit[], truncated = false) {
  runtime.files.search.mockResolvedValue({ hits: list, truncated });
}

const FILE_HIT: Hit = {
  path: "/ws/src/alpha.ts",
  rel: "src/alpha.ts",
  name: "alpha.ts",
  is_dir: false,
};
const DIR_HIT: Hit = {
  path: "/ws/src",
  rel: "src",
  name: "src",
  is_dir: true,
};

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createTestExplorerRuntime();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(open = true) {
  const handlers = {
    onOpenFile: vi.fn(),
    onRequestClose: vi.fn(),
    onActiveChange: vi.fn(),
    onRevealInTerminal: vi.fn(),
    onAttachToAgent: vi.fn(),
  };
  const ref = createRef<ExplorerSearchHandle>();
  const view = render(
    <ExplorerSearch
      ref={ref}
      rootPath="/ws"
      env={{ kind: "local" }}
      open={open}
      {...handlers}
    />,
  );
  return { handlers, ref, view };
}

async function typeQuery(query: string) {
  fireEvent.change(screen.getByPlaceholderText("Search files…"), {
    target: { value: query },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

describe("ExplorerSearch", () => {
  it("renders no input while closed", () => {
    setup(false);
    expect(screen.queryByPlaceholderText("Search files…")).toBeNull();
  });

  it("does not search below the minimum query length", async () => {
    setup();
    await typeQuery("a");
    expect(runtime.files.search).not.toHaveBeenCalled();
    expect(screen.getByText("No matches")).toBeDefined();
  });

  it("debounces and searches via fs_search", async () => {
    hits([FILE_HIT, DIR_HIT]);
    setup();
    await typeQuery("alp");
    expect(runtime.files.search).toHaveBeenCalledTimes(1);
    expect(runtime.files.search).toHaveBeenCalledWith(
      { root: "/ws", query: "alp", limit: 200, showHidden: false },
      { kind: "local" },
    );
    expect(screen.getByText("alpha.ts")).toBeDefined();
    expect(screen.getByText("src/alpha.ts")).toBeDefined();
    expect(screen.getByTitle("/ws/src")).toBeDefined();
  });

  it("reports active state changes", async () => {
    hits([]);
    const { handlers } = setup();
    await typeQuery("alp");
    expect(handlers.onActiveChange).toHaveBeenCalledWith(true);
  });

  it("shows the empty state when nothing matches", async () => {
    hits([]);
    setup();
    await typeQuery("zzz");
    expect(screen.getByText("No matches")).toBeDefined();
  });

  it("shows the truncation notice", async () => {
    hits([FILE_HIT], true);
    setup();
    await typeQuery("alp");
    expect(screen.getByText(/Showing partial results/)).toBeDefined();
  });

  it("recovers from a failing search", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.files.search.mockRejectedValue(new Error("bad"));
    setup();
    await typeQuery("alp");
    expect(screen.getByText("No matches")).toBeDefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("opens a file hit on click but not a directory hit", async () => {
    hits([FILE_HIT, DIR_HIT]);
    const { handlers } = setup();
    await typeQuery("alp");
    fireEvent.click(screen.getByTitle("/ws/src"));
    expect(handlers.onOpenFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("/ws/src/alpha.ts"));
    expect(handlers.onOpenFile).toHaveBeenCalledWith("/ws/src/alpha.ts");
  });

  it("navigates results with arrows and opens with Enter", async () => {
    hits([FILE_HIT, DIR_HIT]);
    const { handlers } = setup();
    await typeQuery("alp");
    const input = screen.getByPlaceholderText("Search files…");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Wraps around from the last hit back to the first.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onOpenFile).toHaveBeenCalledWith("/ws/src/alpha.ts");
  });

  it("ArrowUp wraps to the last result", async () => {
    hits([FILE_HIT, DIR_HIT]);
    const { handlers } = setup();
    await typeQuery("alp");
    const input = screen.getByPlaceholderText("Search files…");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    // Last hit is a directory, so nothing opens.
    expect(handlers.onOpenFile).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { handlers } = setup();
    fireEvent.keyDown(screen.getByPlaceholderText("Search files…"), {
      key: "Escape",
    });
    expect(handlers.onRequestClose).toHaveBeenCalled();
  });

  it("clears the query via the clear button", async () => {
    hits([FILE_HIT]);
    setup();
    await typeQuery("alp");
    fireEvent.click(screen.getByLabelText("Clear search"));
    const input =
      screen.getByPlaceholderText<HTMLInputElement>("Search files…");
    expect(input.value).toBe("");
  });

  it("resets all state when closed", async () => {
    hits([FILE_HIT]);
    const { view } = setup();
    await typeQuery("alp");
    expect(screen.getByText("alpha.ts")).toBeDefined();
    view.rerender(
      <ExplorerSearch
        rootPath="/ws"
        env={{ kind: "local" }}
        open={false}
        onOpenFile={vi.fn()}
        onRequestClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("alpha.ts")).toBeNull();
  });

  it("offers per-hit context actions", async () => {
    hits([FILE_HIT, DIR_HIT]);
    const { handlers } = setup();
    await typeQuery("alp");
    vi.useRealTimers();

    fireEvent.contextMenu(screen.getByTitle("/ws/src/alpha.ts"));
    fireEvent.click(await screen.findByText("Open"));
    expect(handlers.onOpenFile).toHaveBeenCalledWith("/ws/src/alpha.ts");

    fireEvent.contextMenu(screen.getByTitle("/ws/src"));
    expect(screen.queryByText("Open")).toBeNull();
    fireEvent.click(await screen.findByText("Open in Terminal"));
    expect(handlers.onRevealInTerminal).toHaveBeenCalledWith("/ws/src");

    fireEvent.contextMenu(screen.getByTitle("/ws/src/alpha.ts"));
    fireEvent.click(await screen.findByText("Attach to Agent"));
    expect(handlers.onAttachToAgent).toHaveBeenCalledWith("/ws/src/alpha.ts");
  });

  it("selects hovered hits after keyboard-nav cooldown", async () => {
    hits([FILE_HIT, DIR_HIT]);
    const { handlers } = setup();
    await typeQuery("alp");
    fireEvent.mouseEnter(screen.getByTitle("/ws/src"));
    fireEvent.keyDown(screen.getByPlaceholderText("Search files…"), {
      key: "Enter",
    });
    // The hovered directory became the selection; Enter opens nothing.
    expect(handlers.onOpenFile).not.toHaveBeenCalled();
  });

  it("exposes focus and isFocused through the handle", async () => {
    const { ref } = setup();
    expect(ref.current).not.toBeNull();
    act(() => {
      ref.current?.focus();
      vi.advanceTimersByTime(50);
    });
    expect(ref.current?.isFocused()).toBe(true);
  });
});

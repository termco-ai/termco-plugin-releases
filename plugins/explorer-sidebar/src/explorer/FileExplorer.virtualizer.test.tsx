// @vitest-environment jsdom

// Unlike FileExplorer.test.tsx this suite keeps the real TanStack virtualizer:
// it guards against React Compiler memoization replaying an empty
// getVirtualItems() result after the initial measurement rerender.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { DirEntry } from "./lib/useFileTree";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../testRuntime";

import { FileExplorer } from "./FileExplorer";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetHeight",
);
const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  // Give the virtualizer a viewport; jsdom reports 0x0 otherwise.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 300,
  });
});

afterAll(() => {
  if (originalOffsetHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetHeight",
      originalOffsetHeight,
    );
  }
  if (originalOffsetWidth) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetWidth",
      originalOffsetWidth,
    );
  }
  vi.unstubAllGlobals();
});

function entry(name: string, kind: DirEntry["kind"] = "file"): DirEntry {
  return { name, kind, size: 0, mtime: 0, gitignored: false };
}

const MANY_FILES = Array.from({ length: 100 }, (_, i) =>
  entry(`file${String(i).padStart(3, "0")}.ts`),
);

const LISTING: Record<string, DirEntry[]> = {
  "/ws": MANY_FILES,
};
let runtime: ExplorerRuntimeMocks;

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createTestExplorerRuntime();
  runtime.files.readDir.mockImplementation((path) => {
    const entries = LISTING[path];
    if (!entries) return Promise.reject(new Error("not found"));
    return Promise.resolve(entries);
  });
});

afterEach(cleanup);

describe("FileExplorer with a real virtualizer", () => {
  it("renders tree rows and updates the range on scroll", async () => {
    const { container } = render(
      <FileExplorer rootPath="/ws" env={{ kind: "local" }} onOpenFile={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByText("file000.ts")).toBeDefined();
    });
    expect(screen.queryByText("file099.ts")).toBeNull();

    // The scroll rerender changes nothing but the virtualizer's internal
    // state; a stale getVirtualItems() cache would keep the old range.
    const scrollEl = container.querySelector("[data-explorer-drop]");
    if (!scrollEl) throw new Error("scroll container not found");
    fireEvent.scroll(scrollEl, { target: { scrollTop: 10_000 } });
    await waitFor(() => {
      expect(screen.getByText("file099.ts")).toBeDefined();
    });
  });
});

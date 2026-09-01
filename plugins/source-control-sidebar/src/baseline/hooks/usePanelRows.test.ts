// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROW_HEIGHTS } from "../components/constants";
import type {
  SourceControlFileEntry,
  SourceControlPanelState,
} from "../useSourceControlPanel/types";
import { usePanelRows } from "./usePanelRows";

type VirtualizerOptions = {
  count: number;
  estimateSize: (index: number) => number;
  getItemKey: (index: number) => string | number;
};

let lastVirtualizerOptions: VirtualizerOptions | null = null;
const scrollToIndex = vi.fn();

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: VirtualizerOptions) => {
    lastVirtualizerOptions = opts;
    return {
      getTotalSize: () => opts.count * 30,
      getVirtualItems: () => [],
      scrollToIndex,
    };
  },
}));

function fileEntry(
  path: string,
  overrides: Partial<SourceControlFileEntry> = {},
): SourceControlFileEntry {
  return {
    key: path,
    path,
    originalPath: null,
    statusCode: "M",
    statusLabel: "Modified",
    checkState: "unchecked",
    staged: false,
    unstaged: true,
    untracked: false,
    ...overrides,
  };
}

function makeScm(
  fileEntries: SourceControlFileEntry[],
): SourceControlPanelState {
  return {
    fileEntries,
    selectFile: vi.fn(async () => {}),
    toggleStageFile: vi.fn(async () => {}),
    requestDiscardFile: vi.fn(),
  } as unknown as SourceControlPanelState;
}

function keyEvent(
  key: string,
  overrides: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    target: Partial<HTMLElement> & { tagName: string };
  }> = {},
): KeyboardEvent<HTMLDivElement> {
  return {
    key,
    metaKey: overrides.metaKey ?? false,
    ctrlKey: overrides.ctrlKey ?? false,
    target: overrides.target ?? { tagName: "DIV", closest: () => null },
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLDivElement>;
}

function renderRows(options: {
  entries?: SourceControlFileEntry[];
  isDiverged?: boolean;
  focusedRowKey?: string | null;
}) {
  const entries = options.entries ?? [fileEntry("a.ts"), fileEntry("b.ts")];
  const scm = makeScm(entries);
  const setFocusedRowKey = vi.fn();
  const handleRefresh = vi.fn();
  const view = renderHook(
    ({ focusedRowKey }: { focusedRowKey: string | null }) =>
      usePanelRows(scm, {
        isDiverged: options.isDiverged ?? false,
        changedCount: entries.length,
        scrollRef: { current: null },
        focusedRowKey,
        setFocusedRowKey,
        handleRefresh,
      }),
    { initialProps: { focusedRowKey: options.focusedRowKey ?? null } },
  );
  return { ...view, scm, setFocusedRowKey, handleRefresh };
}

beforeEach(() => {
  vi.clearAllMocks();
  lastVirtualizerOptions = null;
});

afterEach(cleanup);

describe("row model", () => {
  it("builds header and entry rows", () => {
    const { result } = renderRows({});
    expect(result.current.rows.map((r) => r.kind)).toEqual([
      "list-header",
      "entry",
      "entry",
    ]);
    const header = result.current.rows[0];
    expect(header.kind === "list-header" && header.count).toBe(2);
  });

  it("prepends the diverged banner", () => {
    const { result } = renderRows({ isDiverged: true });
    expect(result.current.rows[0]).toEqual({
      kind: "banner-diverged",
      key: "banner-diverged",
    });
  });

  it("renders no list rows when the tree is clean", () => {
    const { result } = renderRows({ entries: [] });
    expect(result.current.rows).toEqual([]);
  });

  it("estimates row heights per kind", () => {
    renderRows({ isDiverged: true });
    const options = lastVirtualizerOptions;
    if (!options) throw new Error("virtualizer not initialized");
    expect(options.estimateSize(0)).toBe(ROW_HEIGHTS.banner);
    expect(options.estimateSize(1)).toBe(ROW_HEIGHTS.header);
    expect(options.estimateSize(2)).toBe(ROW_HEIGHTS.entry);
    expect(options.estimateSize(99)).toBe(ROW_HEIGHTS.entry);
    expect(options.getItemKey(0)).toBe("banner-diverged");
    expect(options.getItemKey(99)).toBe(99);
  });

  it("clears the focused key when its row disappears", () => {
    const { setFocusedRowKey } = renderRows({ focusedRowKey: "gone.ts" });
    expect(setFocusedRowKey).toHaveBeenCalledWith(null);
  });

  it("keeps a still-present focused key", () => {
    const { setFocusedRowKey } = renderRows({ focusedRowKey: "a.ts" });
    expect(setFocusedRowKey).not.toHaveBeenCalled();
  });
});

describe("keyboard navigation", () => {
  it("moves focus down onto the first entry", () => {
    const { result, setFocusedRowKey } = renderRows({});
    const event = keyEvent("ArrowDown");
    result.current.handlePanelKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(setFocusedRowKey).toHaveBeenCalledWith("a.ts");
    expect(scrollToIndex).toHaveBeenCalledWith(1, { align: "auto" });
  });

  it("moves focus down from the current entry and clamps at the end", () => {
    const first = renderRows({ focusedRowKey: "a.ts" });
    first.result.current.handlePanelKeyDown(keyEvent("ArrowDown"));
    expect(first.setFocusedRowKey).toHaveBeenCalledWith("b.ts");

    const last = renderRows({ focusedRowKey: "b.ts" });
    last.result.current.handlePanelKeyDown(keyEvent("ArrowDown"));
    expect(last.setFocusedRowKey).toHaveBeenCalledWith("b.ts");
  });

  it("moves focus up and clamps at the first entry", () => {
    const { result, setFocusedRowKey } = renderRows({
      focusedRowKey: "b.ts",
    });
    result.current.handlePanelKeyDown(keyEvent("ArrowUp"));
    expect(setFocusedRowKey).toHaveBeenCalledWith("a.ts");

    const first = renderRows({ focusedRowKey: "a.ts" });
    first.result.current.handlePanelKeyDown(keyEvent("ArrowUp"));
    expect(first.setFocusedRowKey).toHaveBeenCalledWith("a.ts");
  });

  it("ignores navigation without entries", () => {
    const { result, setFocusedRowKey } = renderRows({ entries: [] });
    result.current.handlePanelKeyDown(keyEvent("ArrowDown"));
    expect(setFocusedRowKey).not.toHaveBeenCalled();
  });

  it("opens the focused entry with Enter", () => {
    const { result, scm } = renderRows({ focusedRowKey: "a.ts" });
    result.current.handlePanelKeyDown(keyEvent("Enter"));
    expect(scm.selectFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "a.ts" }),
    );
  });

  it("toggles staging with space and s", () => {
    const bySpace = renderRows({ focusedRowKey: "a.ts" });
    bySpace.result.current.handlePanelKeyDown(keyEvent(" "));
    expect(bySpace.scm.toggleStageFile).toHaveBeenCalled();

    const byS = renderRows({ focusedRowKey: "b.ts" });
    byS.result.current.handlePanelKeyDown(keyEvent("S"));
    expect(byS.scm.toggleStageFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "b.ts" }),
    );
  });

  it("does not toggle staging when meta is held", () => {
    const { result, scm } = renderRows({ focusedRowKey: "a.ts" });
    result.current.handlePanelKeyDown(keyEvent("s", { metaKey: true }));
    expect(scm.toggleStageFile).not.toHaveBeenCalled();
  });

  it("requests a discard with d only for unstaged entries", () => {
    const unstaged = renderRows({ focusedRowKey: "a.ts" });
    unstaged.result.current.handlePanelKeyDown(keyEvent("d"));
    expect(unstaged.scm.requestDiscardFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "a.ts" }),
    );

    const staged = renderRows({
      entries: [
        fileEntry("a.ts", {
          staged: true,
          unstaged: false,
          checkState: "checked",
        }),
      ],
      focusedRowKey: "a.ts",
    });
    staged.result.current.handlePanelKeyDown(keyEvent("D"));
    expect(staged.scm.requestDiscardFile).not.toHaveBeenCalled();
  });

  it("refreshes on meta+r", () => {
    const { result, handleRefresh } = renderRows({});
    const event = keyEvent("r", { metaKey: true });
    result.current.handlePanelKeyDown(event);
    expect(handleRefresh).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();

    const ctrl = renderRows({});
    ctrl.result.current.handlePanelKeyDown(keyEvent("R", { ctrlKey: true }));
    expect(ctrl.handleRefresh).toHaveBeenCalled();
  });

  it("ignores keys originating from inputs and buttons", () => {
    const { result, scm, handleRefresh, setFocusedRowKey } = renderRows({
      focusedRowKey: "a.ts",
    });
    for (const target of [
      { tagName: "TEXTAREA", closest: () => null },
      { tagName: "INPUT", closest: () => null },
      { tagName: "SPAN", closest: () => ({}) as Element },
    ]) {
      result.current.handlePanelKeyDown(
        keyEvent("Enter", {
          target: target as unknown as Partial<HTMLElement> & {
            tagName: string;
          },
        }),
      );
      result.current.handlePanelKeyDown(
        keyEvent("r", {
          metaKey: true,
          target: target as unknown as Partial<HTMLElement> & {
            tagName: string;
          },
        }),
      );
    }
    expect(scm.selectFile).not.toHaveBeenCalled();
    expect(handleRefresh).not.toHaveBeenCalled();
    expect(setFocusedRowKey).not.toHaveBeenCalled();
  });
});

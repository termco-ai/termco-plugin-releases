// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLeafBlockSelection,
  getLeafDraft,
  leafGridSelection,
  setLeafDraft,
  setLeafInputActivity,
  setLeafInputFocus,
  whenSessionReady,
} from "../lib/useTerminalSession";
import { historyCommands, historyRecord } from "./lib/history";
import { createShellEditor, type ShellEditorOptions } from "./lib/shellEditor";
import ShellInput from "./ShellInput";

const editor = vi.hoisted(() => ({
  opts: null as ShellEditorOptions | null,
  value: "",
  handles: [] as Array<Record<string, unknown>>,
}));

vi.mock("./lib/shellEditor", () => ({
  createShellEditor: vi.fn((opts: ShellEditorOptions) => {
    editor.opts = opts;
    const handle = {
      view: { state: { selection: { main: { empty: true } } } },
      focus: vi.fn(),
      getValue: vi.fn(() => editor.value),
      setValue: vi.fn((text: string) => {
        editor.value = text;
      }),
      clear: vi.fn(),
      setEditable: vi.fn(),
      retheme: vi.fn(),
      destroy: vi.fn(),
    };
    editor.handles.push(handle);
    return handle;
  }),
}));

vi.mock("./lib/history", () => ({
  historyCommands: vi.fn(() => Promise.resolve(["git", "ls"])),
  historyList: vi.fn(() => Promise.resolve([])),
  historyRecord: vi.fn(),
  historySuggest: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../lib/useTerminalSession", () => ({
  clearLeafBlockSelection: vi.fn(() => true),
  getLeafDraft: vi.fn(() => ""),
  leafGridSelection: vi.fn(() => null),
  setLeafDraft: vi.fn(),
  setLeafInputActivity: vi.fn(),
  setLeafInputFocus: vi.fn(),
  whenSessionReady: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../fonts", () => ({
  resolveFontFamily: (f: string) => `resolved:${f}`,
}));
vi.mock("../../platform", () => ({
  MOD_KEY: "Ctrl",
  fmtShortcut: (...parts: string[]) => parts.join("+"),
}));
vi.mock("../../preferences", async () => {
  const { create } = await import("zustand");
  const usePreferencesStore = create(() => ({
    terminalFontFamily: "mono",
    terminalFontSize: 14,
  }));
  return { usePreferencesStore };
});

function lastHandle() {
  const h = editor.handles[editor.handles.length - 1];
  if (!h) throw new Error("editor not created");
  return h as {
    view: { state: { selection: { main: { empty: boolean } } } };
    focus: ReturnType<typeof vi.fn>;
    getValue: ReturnType<typeof vi.fn>;
    setValue: ReturnType<typeof vi.fn>;
    setEditable: ReturnType<typeof vi.fn>;
    retheme: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
}

const baseProps = {
  leafId: 1,
  mode: "prompt" as const,
  focused: true,
  themeKey: "t1",
  onSubmit: vi.fn(),
  onInterrupt: vi.fn(),
  getCwd: vi.fn(() => "/cwd"),
};

beforeEach(() => {
  vi.clearAllMocks();
  editor.opts = null;
  editor.value = "";
  editor.handles.length = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ShellInput", () => {
  it("creates the editor with resolved font settings and cwd access", async () => {
    render(<ShellInput {...baseProps} />);
    expect(createShellEditor).toHaveBeenCalledTimes(1);
    expect(editor.opts?.fontFamily).toBe("resolved:mono");
    expect(editor.opts?.fontSize).toBe(14);
    expect(editor.opts?.placeholderText).toContain("Ctrl+U");
    expect(editor.opts?.getCwd?.()).toBe("/cwd");
    await Promise.resolve();
    expect(historyCommands).toHaveBeenCalledWith("", 2000);
    expect(editor.opts?.commandNames?.()).toEqual(["git", "ls"]);
  });

  it("records submitted commands and learns new first words", async () => {
    render(<ShellInput {...baseProps} />);
    await Promise.resolve();
    editor.opts?.onSubmit("terraform apply -auto-approve");
    expect(historyRecord).toHaveBeenCalledWith("terraform apply -auto-approve");
    expect(baseProps.onSubmit).toHaveBeenCalledWith(
      "terraform apply -auto-approve",
    );
    expect(editor.opts?.commandNames?.()[0]).toBe("terraform");
    // Known commands are not duplicated.
    editor.opts?.onSubmit("git push");
    expect(
      editor.opts?.commandNames?.().filter((c) => c === "git"),
    ).toHaveLength(1);
  });

  it("forwards interrupts and escape to the session helpers", () => {
    render(<ShellInput {...baseProps} />);
    editor.opts?.onInterrupt();
    expect(baseProps.onInterrupt).toHaveBeenCalled();
    editor.opts?.onEscape?.();
    expect(clearLeafBlockSelection).toHaveBeenCalledWith(1);
  });

  it("mirrors input activity into the session", () => {
    render(<ShellInput {...baseProps} />);
    editor.opts?.onChange?.("ls");
    expect(setLeafInputActivity).toHaveBeenCalledWith(1, true);
    editor.opts?.onChange?.("");
    expect(setLeafInputActivity).toHaveBeenCalledWith(1, false);
  });

  it("registers a focus callback and swaps drafts when the leaf changes", () => {
    vi.mocked(getLeafDraft).mockImplementation((leafId: number) =>
      leafId === 2 ? "draft for 2" : "",
    );
    const { rerender } = render(<ShellInput {...baseProps} />);
    expect(setLeafInputFocus).toHaveBeenCalledWith(1, expect.any(Function));
    const handle = lastHandle();
    editor.value = "typed on 1";
    rerender(<ShellInput {...baseProps} leafId={2} />);
    // Old leaf keeps its unsent text and releases the focus hook.
    expect(setLeafDraft).toHaveBeenCalledWith(1, "typed on 1");
    expect(setLeafInputActivity).toHaveBeenCalledWith(1, true);
    expect(setLeafInputFocus).toHaveBeenCalledWith(1, null);
    // New leaf restores its own draft.
    expect(handle.setValue).toHaveBeenCalledWith("draft for 2");
    expect(setLeafInputFocus).toHaveBeenCalledWith(2, expect.any(Function));
    expect(whenSessionReady).toHaveBeenCalledWith(2);
  });

  it("disables editing away from the prompt and refocuses at the prompt", () => {
    const { rerender } = render(<ShellInput {...baseProps} mode="running" />);
    const handle = lastHandle();
    expect(handle.setEditable).toHaveBeenCalledWith(false);
    handle.focus.mockClear();
    rerender(<ShellInput {...baseProps} mode="prompt" />);
    expect(handle.setEditable).toHaveBeenCalledWith(true);
    expect(handle.focus).toHaveBeenCalled();
  });

  it("dims the bar while a command runs", () => {
    const { container, rerender } = render(
      <ShellInput {...baseProps} mode="running" />,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "opacity-45",
    );
    rerender(<ShellInput {...baseProps} mode="prompt" />);
    expect(
      (container.firstElementChild as HTMLElement).className,
    ).not.toContain("opacity-45");
  });

  it("rethemes when the theme key changes", () => {
    const { rerender } = render(<ShellInput {...baseProps} />);
    const handle = lastHandle();
    handle.retheme.mockClear();
    rerender(<ShellInput {...baseProps} themeKey="t2" />);
    expect(handle.retheme).toHaveBeenCalledWith("resolved:mono", 14);
  });

  it("copies the grid selection when the editor has none", () => {
    vi.mocked(leafGridSelection).mockReturnValue("grid text");
    const { container } = render(<ShellInput {...baseProps} />);
    const setData = vi.fn();
    fireEvent.copy(container.firstElementChild as Element, {
      clipboardData: { setData },
    });
    expect(setData).toHaveBeenCalledWith("text/plain", "grid text");
  });

  it("lets the editor's own selection copy normally", () => {
    vi.mocked(leafGridSelection).mockReturnValue("grid text");
    const { container } = render(<ShellInput {...baseProps} />);
    lastHandle().view.state.selection.main.empty = false;
    const setData = vi.fn();
    fireEvent.copy(container.firstElementChild as Element, {
      clipboardData: { setData },
    });
    expect(setData).not.toHaveBeenCalled();
  });

  it("destroys the editor on unmount", () => {
    const { unmount } = render(<ShellInput {...baseProps} />);
    unmount();
    expect(lastHandle().destroy).toHaveBeenCalled();
  });
});

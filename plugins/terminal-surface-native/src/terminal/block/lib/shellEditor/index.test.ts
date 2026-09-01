// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createShellEditor, type ShellEditorHandle } from "./index";

vi.mock("../../../../terminalTheme", () => ({
  terminalPalette: () => ({ foreground: "#fff" }),
}));

vi.mock("../pathComplete", () => ({
  pathCompletions: vi.fn(() => Promise.resolve(null)),
}));

let handle: ShellEditorHandle | null = null;

function make(over: Partial<Parameters<typeof createShellEditor>[0]> = {}) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  handle = createShellEditor({
    parent,
    fontFamily: "TestMono",
    fontSize: 13,
    onSubmit: vi.fn(),
    onInterrupt: vi.fn(),
    ...over,
  });
  return handle;
}

function key(h: ShellEditorHandle, k: string, over: KeyboardEventInit = {}) {
  h.view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { key: k, bubbles: true, ...over }),
  );
}

afterEach(() => {
  handle?.destroy();
  handle = null;
  document.body.innerHTML = "";
});

describe("createShellEditor", () => {
  it("round-trips values with the cursor at the end", () => {
    const h = make();
    expect(h.getValue()).toBe("");
    h.setValue("echo hi");
    expect(h.getValue()).toBe("echo hi");
    expect(h.view.state.selection.main.head).toBe("echo hi".length);
    h.clear();
    expect(h.getValue()).toBe("");
  });

  it("renders the placeholder text", () => {
    const h = make({ placeholderText: "Type here" });
    expect(h.view.dom.textContent).toContain("Type here");
  });

  it("uses the default placeholder when none is given", () => {
    const h = make();
    expect(h.view.dom.textContent).toContain("Run a command");
  });

  it("submits the line on Enter and clears the input", () => {
    const onSubmit = vi.fn();
    const h = make({ onSubmit });
    h.setValue("git status");
    key(h, "Enter");
    expect(onSubmit).toHaveBeenCalledWith("git status");
    expect(h.getValue()).toBe("");
  });

  it("swallows Enter on blank input without submitting", () => {
    const onSubmit = vi.fn();
    const h = make({ onSubmit });
    h.setValue("   ");
    key(h, "Enter");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(h.getValue()).toBe("   ");
  });

  it("inserts a newline on Shift+Enter instead of submitting", () => {
    const onSubmit = vi.fn();
    const h = make({ onSubmit });
    h.setValue("line1");
    key(h, "Enter", { shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(h.getValue()).toBe("line1\n");
  });

  it("interrupts and clears on Ctrl+C", () => {
    const onInterrupt = vi.fn();
    const h = make({ onInterrupt });
    h.setValue("sleep 100");
    key(h, "c", { ctrlKey: true });
    expect(onInterrupt).toHaveBeenCalled();
    expect(h.getValue()).toBe("");
  });

  it("reports every edit through onChange", () => {
    const onChange = vi.fn();
    const h = make({ onChange });
    h.setValue("ls");
    expect(onChange).toHaveBeenCalledWith("ls");
    h.clear();
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("falls through to onEscape when nothing else handles Escape", () => {
    const onEscape = vi.fn(() => true);
    const h = make({ onEscape });
    key(h, "Escape");
    expect(onEscape).toHaveBeenCalled();
  });

  it("toggles editability", () => {
    const h = make();
    expect(h.view.contentDOM.getAttribute("contenteditable")).toBe("true");
    h.setEditable(false);
    expect(h.view.contentDOM.getAttribute("contenteditable")).toBe("false");
    h.setEditable(true);
    expect(h.view.contentDOM.getAttribute("contenteditable")).toBe("true");
  });

  it("rethemes fonts live", () => {
    const h = make();
    h.retheme("OtherMono", 21);
    const css = [...document.head.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toContain("OtherMono");
    expect(css).toContain("21px");
  });

  it("destroy removes the editor from the DOM", () => {
    const h = make();
    const dom = h.view.dom;
    expect(dom.isConnected).toBe(true);
    h.destroy();
    expect(dom.isConnected).toBe(false);
    handle = null;
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabRenameInput } from "./TabRenameInput";

const onCommit = vi.fn();
const onCancel = vi.fn();

function mount(initial = "shell") {
  const utils = render(
    <TabRenameInput
      initial={initial}
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  const input = utils.getByLabelText("Rename tab") as HTMLInputElement;
  return { ...utils, input };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TabRenameInput", () => {
  it("focuses and selects its content on mount", async () => {
    const { input } = mount("shell");
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("shell".length);
  });

  it("commits on Enter even when the value is unchanged", () => {
    const { input } = mount("shell");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("shell");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("commits the edited value on Enter", () => {
    const { input } = mount("shell");
    fireEvent.change(input, { target: { value: "Server" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("Server");
  });

  it("cancels on Escape and ignores the trailing blur", () => {
    const { input } = mount("shell");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits a changed value on blur", () => {
    const { input } = mount("shell");
    fireEvent.change(input, { target: { value: "Build" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("Build");
  });

  it("cancels instead of freezing an unchanged label on blur", () => {
    const { input } = mount("shell");
    fireEvent.blur(input);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps the edit open when the whole window lost focus", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { input } = mount("shell");
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

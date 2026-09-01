// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineRename } from "./InlineRename";

const onCommit = vi.fn();
const onCancel = vi.fn();

function mount(initial = "Space") {
  const utils = render(
    <InlineRename initial={initial} onCommit={onCommit} onCancel={onCancel} />,
  );
  const input = utils.getByLabelText("Rename rig") as HTMLInputElement;
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

describe("InlineRename", () => {
  it("focuses and selects its content on mount", async () => {
    const { input } = mount("Rig");
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe("Rig".length);
  });

  it("commits on Enter", () => {
    const { input } = mount();
    fireEvent.change(input, { target: { value: "Work" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("Work");
  });

  it("cancels on Escape and ignores the trailing blur", () => {
    const { input } = mount();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("commits on blur", () => {
    const { input } = mount();
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("Renamed");
  });

  it("keeps the edit open when the window itself lost focus", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { input } = mount();
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

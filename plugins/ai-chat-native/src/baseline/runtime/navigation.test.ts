import type { EditorNavigationCapability } from "@termco/editor-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureEditorNavigation,
  openFileFromBlock,
} from "./navigation";

let dispose: (() => void) | undefined;

afterEach(() => dispose?.());

describe("AI rich-view editor navigation", () => {
  it("opens a line through the public editor capability", () => {
    const editor = {
      openFile: vi.fn(() => 1),
      openFileAt: vi.fn(() => 1),
    } as unknown as EditorNavigationCapability;
    dispose = configureEditorNavigation(editor);

    openFileFromBlock("/workspace/README.md", 12, 4);

    expect(editor.openFileAt).toHaveBeenCalledWith(
      "/workspace/README.md",
      12,
      true,
    );
  });

  it("opens references without a line as pinned editor tabs", () => {
    const editor = {
      openFile: vi.fn(() => 1),
      openFileAt: vi.fn(() => 1),
    } as unknown as EditorNavigationCapability;
    dispose = configureEditorNavigation(editor);

    openFileFromBlock("/workspace/README.md");

    expect(editor.openFile).toHaveBeenCalledWith(
      "/workspace/README.md",
      true,
    );
  });
});

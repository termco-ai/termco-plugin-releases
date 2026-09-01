import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyToClipboard,
  relativePath,
  revealInFinder,
} from "./contextActions";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../../testRuntime";

let runtime: ExplorerRuntimeMocks;

beforeEach(() => {
  runtime = createTestExplorerRuntime();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("relativePath", () => {
  it("returns . for the root itself", () => {
    expect(relativePath("/ws", "/ws")).toBe(".");
  });

  it("strips the root prefix", () => {
    expect(relativePath("/ws", "/ws/src/a.ts")).toBe("src/a.ts");
  });

  it("returns the path unchanged when outside the root", () => {
    expect(relativePath("/ws", "/elsewhere/a.ts")).toBe("/elsewhere/a.ts");
  });

  it("does not treat a sibling prefix as inside the root", () => {
    expect(relativePath("/ws", "/ws-other/a.ts")).toBe("/ws-other/a.ts");
  });
});

describe("copyToClipboard", () => {
  it("writes to the clipboard when available", async () => {
    await copyToClipboard("hello");
    expect(runtime.desktop.writeClipboardText).toHaveBeenCalledWith("hello");
  });

  it("swallows clipboard failures", async () => {
    runtime.desktop.writeClipboardText.mockImplementation(() => {
      throw new Error("denied");
    });
    await expect(copyToClipboard("hello")).resolves.toBeUndefined();
  });

  it("swallows a missing clipboard entirely", async () => {
    runtime.desktop.writeClipboardText.mockImplementation(() => {
      throw new Error("missing");
    });
    await expect(copyToClipboard("hello")).resolves.toBeUndefined();
  });
});

describe("revealInFinder", () => {
  it("delegates to the opener plugin", async () => {
    await revealInFinder("/ws/a.ts");
    expect(runtime.desktop.revealItem).toHaveBeenCalledWith("/ws/a.ts");
  });

  it("logs instead of throwing on failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.desktop.revealItem.mockImplementation(() => {
      throw new Error("nope");
    });
    await expect(revealInFinder("/ws/a.ts")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

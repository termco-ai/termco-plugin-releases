// Kept with the source-owning terminal plugin.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  readClipboardText: vi.fn<() => string>(),
  writeClipboardText: vi.fn<(t: string) => void>(),
}));
vi.mock("../../runtime", () => ({
  terminalRuntime: () => ({ desktop: native }),
}));

const web = {
  readText: vi.fn<() => Promise<string>>(),
  writeText: vi.fn<(t: string) => Promise<void>>(),
};

const original = globalThis.navigator;
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

function platform(userAgent: string) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent, clipboard: web },
  });
}

async function load() {
  vi.resetModules();
  return import("./terminalClipboard");
}

describe("terminalClipboard", () => {
  beforeEach(() => {
    native.readClipboardText.mockReset();
    native.writeClipboardText.mockReset();
    web.readText.mockReset();
    web.writeText.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: original,
    });
  });

  it("reads the native clipboard first on Linux", async () => {
    platform(LINUX);
    native.readClipboardText.mockReturnValue("native");
    web.readText.mockResolvedValue("web");
    const { readTerminalClipboard } = await load();
    await expect(readTerminalClipboard()).resolves.toBe("native");
    expect(web.readText).not.toHaveBeenCalled();
  });

  it("falls back to the web clipboard when the native read fails", async () => {
    platform(LINUX);
    native.readClipboardText.mockImplementation(() => {
      throw new Error("no provider");
    });
    web.readText.mockResolvedValue("web");
    const { readTerminalClipboard } = await load();
    await expect(readTerminalClipboard()).resolves.toBe("web");
  });

  it("never touches the native clipboard off Linux", async () => {
    platform(MAC);
    web.readText.mockResolvedValue("web");
    const { readTerminalClipboard, writeTerminalClipboard } = await load();
    await expect(readTerminalClipboard()).resolves.toBe("web");
    await writeTerminalClipboard("x");
    expect(native.readClipboardText).not.toHaveBeenCalled();
    expect(native.writeClipboardText).not.toHaveBeenCalled();
    expect(web.writeText).toHaveBeenCalledWith("x");
  });

  it("writes the native clipboard first on Linux", async () => {
    platform(LINUX);
    const { writeTerminalClipboard } = await load();
    await writeTerminalClipboard("copied");
    expect(native.writeClipboardText).toHaveBeenCalledWith("copied");
    expect(web.writeText).not.toHaveBeenCalled();
  });
});

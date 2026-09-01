// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { copy, fmtDuration, fmtTime, relPath } from "./overlayFormat";

const home = vi.hoisted(() => ({ path: "" }));

vi.mock("../../../runtime", () => ({
  terminalRuntime: () => ({ workspace: { homeDir: () => home.path } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("fmtDuration", () => {
  it("returns null for non-positive or non-finite input", () => {
    expect(fmtDuration(0)).toBeNull();
    expect(fmtDuration(-5)).toBeNull();
    expect(fmtDuration(Number.NaN)).toBeNull();
    expect(fmtDuration(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("formats sub-second durations in ms", () => {
    expect(fmtDuration(1)).toBe("1ms");
    expect(fmtDuration(999)).toBe("999ms");
  });

  it("formats seconds with one decimal below 10s", () => {
    expect(fmtDuration(1500)).toBe("1.5s");
    expect(fmtDuration(9999)).toBe("10.0s");
  });

  it("formats whole seconds from 10s to a minute", () => {
    expect(fmtDuration(15000)).toBe("15s");
    expect(fmtDuration(59000)).toBe("59s");
  });

  it("formats minutes with and without a seconds part", () => {
    expect(fmtDuration(65000)).toBe("1m 5s");
    expect(fmtDuration(120000)).toBe("2m");
  });

  it("formats hours with and without a minutes part", () => {
    expect(fmtDuration(3_600_000)).toBe("1h");
    expect(fmtDuration(5_400_000)).toBe("1h 30m");
  });

  it("carries rounded seconds into the minute at the 60s boundary", () => {
    expect(fmtDuration(59_999)).toBe("1m");
    expect(fmtDuration(119_499)).toBe("1m 59s");
    expect(fmtDuration(119_999)).toBe("2m");
    expect(fmtDuration(120_000)).toBe("2m");
  });

  it("carries rounded minutes into the hour at the 60m boundary", () => {
    expect(fmtDuration(3_599_499)).toBe("59m 59s");
    expect(fmtDuration(3_599_999)).toBe("1h");
    expect(fmtDuration(7_199_999)).toBe("2h");
  });
});

describe("fmtTime", () => {
  it("renders zero-padded 24h clock time", () => {
    expect(fmtTime(new Date(2026, 0, 1, 9, 5).getTime())).toBe("09:05");
    expect(fmtTime(new Date(2026, 0, 1, 23, 59).getTime())).toBe("23:59");
  });
});

describe("relPath", () => {
  it("passes paths through when the provider has no home directory", () => {
    home.path = "";
    expect(relPath("/home/user/project")).toBe("/home/user/project");
  });

  it("shortens paths relative to the selected workspace home", () => {
    home.path = "/home/user/";
    expect(relPath("/home/user/project")).toBe("~/project");
    expect(relPath("/home/user")).toBe("~");
  });

  it("leaves non-home paths and prefix look-alikes untouched", () => {
    home.path = "/home/user/";
    expect(relPath("/etc/hosts")).toBe("/etc/hosts");
    expect(relPath("/home/username/x")).toBe("/home/username/x");
  });
});

describe("copy", () => {
  it("writes to the clipboard and toasts on success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    copy("some text", "Copied");
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("some text");
    expect(toast.success).toHaveBeenCalledWith("Copied");
  });

  it("swallows clipboard failures without toasting", async () => {
    vi.mocked(toast.success).mockClear();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    expect(() => copy("x", "Copied")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

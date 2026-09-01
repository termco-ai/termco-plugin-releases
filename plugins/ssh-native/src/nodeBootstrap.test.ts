import { describe, expect, it, vi } from "vitest";

// nodeBootstrap imports electron (`app`) + undici (`fetch`) at load; stub both so
// the pure mapping fn can be tested in a plain node vitest environment.
vi.mock("electron", () => ({ app: { getPath: () => "/tmp/termco-test" } }));
vi.mock("undici", () => ({ fetch: vi.fn() }));

import { mapNodeTarget } from "./nodeBootstrap";

describe("mapNodeTarget", () => {
  it("maps supported uname combinations to Node dist targets", () => {
    expect(mapNodeTarget("Linux", "x86_64")).toEqual({ os: "linux", arch: "x64" });
    expect(mapNodeTarget("Linux", "amd64")).toEqual({ os: "linux", arch: "x64" });
    expect(mapNodeTarget("Linux", "aarch64")).toEqual({ os: "linux", arch: "arm64" });
    expect(mapNodeTarget("Linux", "armv7l")).toEqual({ os: "linux", arch: "armv7l" });
    expect(mapNodeTarget("Darwin", "arm64")).toEqual({ os: "darwin", arch: "arm64" });
    expect(mapNodeTarget("Darwin", "x86_64")).toEqual({ os: "darwin", arch: "x64" });
  });

  it("returns null for platforms without an official Node build", () => {
    expect(mapNodeTarget("Windows_NT", "x86_64")).toBeNull();
    expect(mapNodeTarget("Linux", "mips64")).toBeNull();
    expect(mapNodeTarget("Darwin", "armv7l")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  isRunningState,
  runtimeBadgeClass,
  runtimeLabel,
  stateBadge,
} from "./runtimeMeta";

describe("runtimeLabel", () => {
  it("labels each runtime", () => {
    expect(runtimeLabel("docker")).toBe("Docker");
    expect(runtimeLabel("podman")).toBe("Podman");
    expect(runtimeLabel("apple")).toBe("Apple");
  });
});

describe("runtimeBadgeClass", () => {
  it("gives a distinct class per runtime", () => {
    const classes = new Set([
      runtimeBadgeClass("docker"),
      runtimeBadgeClass("podman"),
      runtimeBadgeClass("apple"),
    ]);
    expect(classes.size).toBe(3);
  });
});

describe("isRunningState", () => {
  it("treats running/up as running, everything else as not", () => {
    expect(isRunningState("running")).toBe(true);
    expect(isRunningState("Up")).toBe(true);
    expect(isRunningState("exited")).toBe(false);
    expect(isRunningState("stopped")).toBe(false);
    expect(isRunningState("")).toBe(false);
  });
});

describe("stateBadge", () => {
  it("maps known states to labels", () => {
    expect(stateBadge("running").label).toBe("running");
    expect(stateBadge("paused").label).toBe("paused");
    expect(stateBadge("created").label).toBe("created");
    expect(stateBadge("exited").label).toBe("exited");
    expect(stateBadge("stopped").label).toBe("stopped");
  });

  it("is case-insensitive and falls back for unknown states", () => {
    expect(stateBadge("RUNNING").label).toBe("running");
    expect(stateBadge("weird").label).toBe("weird");
    expect(stateBadge("").label).toBe("unknown");
  });
});

// Source-owned by the coding-agent-native plugin.
import { describe, expect, it } from "vitest";
import type { AgentRunView } from "../store/codingAgentsStore";
import { formatContext, formatDuration, workspaceLabel } from "./runMeta";

/** Minimal run view carrying just the usage fields formatContext reads. */
function view(usage: AgentRunView["usage"]): AgentRunView {
  return { usage } as unknown as AgentRunView;
}

describe("formatContext", () => {
  it("returns percent-of-window from input tokens", () => {
    expect(
      formatContext(view({ inputTokens: 20_000, contextWindow: 200_000 })),
    ).toBe("10% of 200k");
  });

  it("caps at 100%", () => {
    expect(
      formatContext(view({ inputTokens: 300_000, contextWindow: 200_000 })),
    ).toBe("100% of 200k");
  });

  it("is empty when the window is unknown", () => {
    expect(formatContext(view({ inputTokens: 5000 }))).toBe("");
    expect(formatContext(view(null))).toBe("");
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes, hours", () => {
    expect(formatDuration(3_000)).toBe("3s");
    expect(formatDuration(120_000)).toBe("2m");
    expect(formatDuration(3_840_000)).toBe("1h 4m");
  });
});

describe("workspaceLabel", () => {
  it("is null for local / absent workspaces (no badge noise)", () => {
    expect(workspaceLabel(undefined)).toBeNull();
    expect(workspaceLabel(null)).toBeNull();
    expect(workspaceLabel({ kind: "local" })).toBeNull();
  });

  it("labels ssh as user@host (user optional)", () => {
    expect(
      workspaceLabel({ kind: "ssh", connectionId: "c", host: "opendoc-v2", user: "root" }),
    ).toBe("root@opendoc-v2");
    expect(workspaceLabel({ kind: "ssh", connectionId: "c", host: "h" })).toBe("h");
  });

  it("labels wsl with its distro when known", () => {
    expect(workspaceLabel({ kind: "wsl" })).toBe("wsl");
    expect(workspaceLabel({ kind: "wsl", distro: "Ubuntu" })).toBe("wsl:Ubuntu");
  });
});

import { describe, expect, it, vi } from "vitest";
import { maybeNotify, notificationText, notifyKind } from "./notifications";

describe("notifyKind", () => {
  it("maps events to notification kinds", () => {
    expect(notifyKind({ type: "approval-request", approvalId: "a", name: "Bash" })).toBe("approval");
    expect(notifyKind({ type: "turn-end" })).toBe("done");
    expect(notifyKind({ type: "error", message: "x", fatal: true })).toBe("error");
  });

  it("ignores non-fatal errors and other events", () => {
    expect(notifyKind({ type: "error", message: "x" })).toBeNull();
    expect(notifyKind({ type: "text", text: "hi" })).toBeNull();
    expect(notifyKind({ type: "exit", code: 0 })).toBeNull();
  });
});

describe("notificationText", () => {
  it("uses the run title, falling back to a default", () => {
    expect(notificationText("approval", "Fix auth").title).toBe("Fix auth");
    expect(notificationText("done", "  ").title).toBe("Coding agent");
    expect(notificationText("error", "t").body).toBe("Run errored");
  });
});

describe("maybeNotify", () => {
  const base = () => ({
    notify: vi.fn(),
    focusRun: vi.fn(),
    isFocused: vi.fn(() => false),
  });

  it("shows a notification when unfocused and clicking opens the run", () => {
    const deps = base();
    const shown = maybeNotify(deps, {
      event: { type: "turn-end" },
      runId: "r1",
      runTitle: "Task",
    });
    expect(shown).toBe(true);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    // Invoke the click handler → focuses the run.
    deps.notify.mock.calls[0][0].onClick();
    expect(deps.focusRun).toHaveBeenCalledWith("r1");
  });

  it("does not notify when the window is focused", () => {
    const deps = base();
    deps.isFocused.mockReturnValue(true);
    expect(
      maybeNotify(deps, { event: { type: "turn-end" }, runId: "r", runTitle: "T" }),
    ).toBe(false);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("does not notify for uninteresting events", () => {
    const deps = base();
    expect(
      maybeNotify(deps, { event: { type: "text", text: "x" }, runId: "r", runTitle: "T" }),
    ).toBe(false);
  });
});
// Owned by the coding-agent-native provider plugin.

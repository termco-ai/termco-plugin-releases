// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureAgentActivityListener,
  isAgentActivePty,
  startAgentActivityListener,
} from "./agentActivity";

type Signal = { id: number; kind: string };
const events = vi.hoisted(() => ({
  listener: null as ((payload: unknown) => void) | null,
  unsubscribe: vi.fn(),
  subscribe: vi.fn(
    (_event: string, listener: (payload: unknown) => void) => {
      events.listener = listener;
      return events.unsubscribe;
    },
  ),
}));
vi.mock("../../runtime", () => ({
  terminalRuntime: () => ({ events: { subscribe: events.subscribe } }),
}));

let dispose: () => void;

function signal(payload: Signal): void {
  if (!events.listener) throw new Error("agent-signal listener not registered");
  events.listener(payload);
}

beforeEach(() => {
  events.subscribe.mockClear();
  events.unsubscribe.mockClear();
  events.listener = null;
  dispose = startAgentActivityListener();
});

afterEach(() => dispose());

describe("agentActivity", () => {
  it("registers the selected event provider once", () => {
    ensureAgentActivityListener(() => {});
    ensureAgentActivityListener(() => {});
    startAgentActivityListener();
    expect(events.subscribe).toHaveBeenCalledTimes(1);
    expect(events.subscribe).toHaveBeenCalledWith(
      "termco:agent-signal",
      expect.any(Function),
    );
  });

  it("tracks started ptys as active", () => {
    ensureAgentActivityListener(() => {});
    signal({ id: 11, kind: "started" });
    expect(isAgentActivePty(11)).toBe(true);
    expect(isAgentActivePty(12)).toBe(false);
  });

  it("ignores intermediate lifecycle kinds", () => {
    ensureAgentActivityListener(() => {});
    signal({ id: 21, kind: "started" });
    signal({ id: 21, kind: "working" });
    signal({ id: 21, kind: "attention" });
    expect(isAgentActivePty(21)).toBe(true);
  });

  it("clears activity and notifies on exited", () => {
    const exited = vi.fn();
    ensureAgentActivityListener(exited);
    signal({ id: 31, kind: "started" });
    signal({ id: 31, kind: "exited" });
    expect(isAgentActivePty(31)).toBe(false);
    expect(exited).toHaveBeenCalledWith(31);
  });

  it("uses the most recently registered exited callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    ensureAgentActivityListener(first);
    ensureAgentActivityListener(second);
    signal({ id: 41, kind: "exited" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(41);
  });
});

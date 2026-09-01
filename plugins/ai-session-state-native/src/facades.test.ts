import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import { SessionId } from "@termco/session-base";
import type { UiWorkspaceComposerCapability } from "@termco/ui-workspace-base";
import { describe, expect, it, vi } from "vitest";
import { createSessionStateFacades } from "./facades";

function sessions(activeSessionId: string): AiSessionsCapability {
  return {
    snapshot: () => ({
      revision: 4,
      panelOpen: false,
      miniOpen: false,
      selectedModelId: "model-a",
      activeSessionId,
      agent: { status: "idle", step: null, error: null },
    }),
    subscribe(next) {
      void next;
      return () => {};
    },
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    togglePanel: vi.fn(),
    openMini: vi.fn(),
    closeMini: vi.fn(),
    focusInput: vi.fn(),
    attachSelection: vi.fn(),
    attachFile: vi.fn(),
    attachImage: vi.fn(),
    openSession: vi.fn(async () => {}),
    rerunFrom: vi.fn(async () => ({ childSessionId: SessionId("child") })),
    sessionContext: () => ({ rigId: "default" }),
    sendMessage: vi.fn(async () => {}),
    respondToApproval: vi.fn(),
  };
}

function composer(available: boolean): UiWorkspaceComposerCapability {
  return {
    snapshot: () => ({ revision: 2, available, hostedElsewhere: false }),
    subscribe: () => () => {},
    focus: vi.fn(),
    Region: () => null,
  };
}

describe("stable AI session state facades", () => {
  it("retains session identity and readable state when Chat detaches", () => {
    const state = createSessionStateFacades();
    const service = state.sessions;
    const changed = vi.fn();
    service.subscribe(changed);
    const detach = state.sessionHost.bind(sessions("session-1"));

    expect(service.snapshot().activeSessionId).toBe("session-1");
    detach();

    expect(state.sessions).toBe(service);
    expect(service.snapshot().activeSessionId).toBe("session-1");
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("rejects new requests structurally while the execution host is absent", async () => {
    const state = createSessionStateFacades();
    await expect(state.sessions.sendMessage("session-1", "hello")).rejects.toMatchObject({
      code: "AI_SESSION_HOST_UNAVAILABLE",
    });
    await expect(state.sessions.openSession(SessionId("session-1"))).rejects.toMatchObject({
      code: "AI_SESSION_HOST_UNAVAILABLE",
    });
  });

  it("keeps the workspace composer facade stable across presentation off/on", () => {
    const state = createSessionStateFacades();
    const service = state.composer;
    const detach = state.composerHost.bind(composer(true));
    expect(service.snapshot().available).toBe(true);

    detach();
    expect(state.composer).toBe(service);
    expect(service.snapshot()).toMatchObject({
      available: false,
      hostedElsewhere: false,
    });

    state.composerHost.bind(composer(true));
    expect(service.snapshot().available).toBe(true);
  });
});

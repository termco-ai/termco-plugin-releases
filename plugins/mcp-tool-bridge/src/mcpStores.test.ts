import { describe, expect, it, vi } from "vitest";
import { createMcpApprovalStore } from "./mcpApprovalStore";
import { createMcpInteractionStore } from "./mcpInteractionStore";

describe("source-owned MCP UI stores", () => {
  it("deduplicates an approval and replies through the selected server", async () => {
    const reply = vi.fn(async () => ({ ok: true }));
    const store = createMcpApprovalStore(reply);
    const request = {
      requestId: "approval-1",
      source: { kind: "user" as const, label: "E2E agent" },
      rig: { rigId: "rig-1", rigName: "Default" },
      toolName: "terminal_run",
      input: { command: "echo hello" },
      catastrophic: false,
    };

    store.add(request);
    store.add(request);
    expect(store.useStore.getState().pending).toEqual([request]);

    store.useStore.getState().answer(request.requestId, false);
    expect(store.useStore.getState().pending).toEqual([]);
    expect(reply).toHaveBeenCalledWith(request.requestId, {
      allow: false,
      always: undefined,
    });
  });

  it("answers and dismisses managed-run interactions locally", () => {
    const reply = vi.fn(async () => ({ ok: true }));
    const store = createMcpInteractionStore(reply);
    store.add({
      requestId: "question-1",
      runId: "run-1",
      kind: "ask_user",
      input: { question: "Continue?" },
    });
    store.useStore.getState().answer("question-1", { answer: "Yes" });
    expect(reply).toHaveBeenCalledWith("question-1", { answer: "Yes" });

    store.add({
      requestId: "view-1",
      runId: "run-1",
      kind: "show_ui",
      input: { title: "Result" },
    });
    store.useStore.getState().dismiss("view-1");
    expect(store.useStore.getState().pending).toEqual([]);
  });
});

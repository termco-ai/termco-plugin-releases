import { describe, expect, it, vi } from "vitest";
import type { AiLiveCapability } from "@termco/ai-live-base";
import type {
  AiStandaloneToolExecutionInput,
  AiToolContribution,
  AiToolExecutionCapability,
} from "@termco/ai-tools-base";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";
import { createMcpToolRuntime, toMcpContent } from "./toolExecutor";

function dependencies() {
  const calls = {
    listTabs: [] as string[],
    run: [] as string[],
  };
  const live: AiLiveCapability = {
    getCwd: (rigId) => `/root/${rigId}`,
    getTerminalContext: () => "",
    isActiveTerminalPrivate: () => false,
    injectIntoActivePty: () => true,
    runInActiveTerminal: async (command, rigId) => {
      calls.run.push(String(rigId));
      return { output: `ran ${command}`, cwd: `/root/${rigId}` };
    },
    getWorkspaceRoot: () => "/root",
    getActiveFile: () => null,
    getActiveKind: () => "terminal",
    setAgentCwd: () => {},
    openPreview: () => true,
    getBrowserTabId: () => null,
    openBrowser: () => 1,
    listBrowserTabs: () => [],
    switchBrowserTab: () => true,
    closeBrowserTab: () => true,
    listTabs: (rigId) => {
      calls.listTabs.push(String(rigId));
      return [{ id: 1, kind: "terminal", title: "t", active: true }];
    },
    focusView: () => ({ ok: true }),
    spawnManagedAgent: () => null,
    readLeafBuffer: () => null,
  };
  const snapshot = {
    hydrated: true,
    activeId: "rig-A",
    rigs: [
      {
        id: "rig-B",
        name: "B",
        root: "/root/rig-B",
        workspace: { kind: "local" as const },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  const rigs = {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    create: vi.fn(),
    rename: vi.fn(),
    setWorkspace: vi.fn(),
    setColor: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
    activate: vi.fn(),
    cycle: vi.fn(),
  } as unknown as WorkspaceRigsCapability;
  const contributionEntries: AiToolContribution[] = [
    {
      id: "view",
      group: "terminal",
      build: (runtime) => ({
        list_tabs: {
          description: "List tabs",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          execute: () => ({ tabs: runtime.listTabs?.() ?? [] }),
        },
      }),
    },
    {
      id: "terminal",
      group: "terminal",
      build: (runtime) => ({
        terminal_run: {
          description: "Run in visible terminal",
          inputSchema: {
            type: "object",
            properties: { command: { type: "string" } },
            required: ["command"],
            additionalProperties: false,
          },
          needsApproval: true,
          execute: (input) =>
            runtime.runInTerminal?.(
              String((input as Record<string, unknown>).command),
            ),
        },
      }),
    },
    {
      id: "ask-user",
      group: "core",
      build: () => ({
        ask_user: {
          description: "Ask the user",
          inputSchema: { type: "object", properties: {} },
        },
      }),
    },
  ];
  const contributions = {
    snapshot: () => contributionEntries,
    subscribe: () => () => {},
  };
  const execution = {
    executeStandalone: vi.fn(async (input: AiStandaloneToolExecutionInput) => {
      if (
        input.name === "terminal_run" &&
        typeof (input.input as Record<string, unknown>).command !== "string"
      ) {
        return {
          sessionId: `session-${input.externalRequestId}` as never,
          ok: false as const,
          error: {
            name: "AiToolExecutionError",
            code: "INVALID_INPUT",
            message: "command must be a string",
          },
          canonicalOutput: { error: "invalid" },
          modelContent: { type: "json", value: { error: "invalid" } },
        };
      }
      const output = await input.definition.execute(input.input);
      const shaped = input.definition.toModelOutput?.({ output }) ?? {
        type: "json",
        value: output,
      };
      return {
        sessionId: `session-${input.externalRequestId}` as never,
        ok: true as const,
        output,
        canonicalOutput: output as never,
        modelContent: shaped as never,
      };
    }),
  } as unknown as AiToolExecutionCapability;
  const approve = vi.fn(async () => ({
    allow: true,
    outcome: "allowed-by-policy" as const,
    responder: "policy" as const,
  }));
  return { calls, contributions, execution, approve, live, rigs };
}

describe("MCP tool executor", () => {
  it("runs list_tabs against the requested rig, not the active rig", async () => {
    const deps = dependencies();
    const runtime = createMcpToolRuntime(deps);
    const reply = await runtime.execute({
      requestId: "q1",
      rigId: "rig-B",
      toolName: "list_tabs",
      input: {},
    });
    expect(reply).toMatchObject({ requestId: "q1", ok: true });
    expect(deps.calls.listTabs).toEqual(["rig-B"]);
  });

  it("routes terminal_run to the requested rig", async () => {
    const deps = dependencies();
    const runtime = createMcpToolRuntime(deps);
    const reply = await runtime.execute({
      requestId: "q2",
      rigId: "rig-B",
      toolName: "terminal_run",
      input: { command: "echo hi" },
    });
    expect(reply).toMatchObject({ requestId: "q2", ok: true });
    expect(deps.calls.run).toEqual(["rig-B"]);
  });

  it("rejects invalid input and tools outside the curated surface", async () => {
    const runtime = createMcpToolRuntime(dependencies());
    await expect(
      runtime.execute({
        requestId: "q3",
        rigId: "rig-B",
        toolName: "terminal_run",
        input: { command: 123 },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "invalid-input" } });
    await expect(
      runtime.execute({
        requestId: "q4",
        rigId: "rig-B",
        toolName: "bash_run",
        input: {},
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "unknown-tool" } });
  });

  it("does not dispatch run-only tools", async () => {
    const runtime = createMcpToolRuntime(dependencies());
    await expect(
      runtime.execute({
        requestId: "q5",
        rigId: "rig-B",
        toolName: "ask_user",
        input: {},
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "not-dispatchable" },
    });
  });

  it("keeps schema and context-free tools usable without live workspace enrichments", async () => {
    const contribution: AiToolContribution = {
      id: "view",
      group: "terminal",
      build: (toolRuntime) => ({
        list_tabs: {
          inputSchema: { type: "object", properties: {} },
          execute: () => ({ tabs: toolRuntime.listTabs?.() ?? [] }),
        },
      }),
    };
    const runtime = createMcpToolRuntime({
      contributions: {
        snapshot: () => [contribution],
        subscribe: () => () => {},
      },
      execution: dependencies().execution,
      approve: dependencies().approve,
      live: () => undefined,
      rigs: () => undefined,
    });

    await expect(
      runtime.execute({
        requestId: "q6",
        rigId: "missing",
        toolName: "list_tabs",
        input: {},
      }),
    ).resolves.toEqual({
      requestId: "q6",
      ok: true,
      result: { tabs: [] },
    });
  });
});

describe("MCP rich result conversion", () => {
  it("maps image data to an MCP image content block", () => {
    expect(
      toMcpContent(
        {
          type: "content",
          value: [
            { type: "text", text: "Screenshot" },
            {
              type: "image-data",
              data: "BASE64PNG",
              mediaType: "image/png",
            },
          ],
        },
      ),
    ).toEqual({
      content: [
        { type: "text", text: "Screenshot" },
        { type: "image", data: "BASE64PNG", mimeType: "image/png" },
      ],
    });
  });
});

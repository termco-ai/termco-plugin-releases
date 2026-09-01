import type { AiToolRuntime } from "@termco/ai-tools-base";
import type { ShellExecutionCapability } from "@termco/terminal-base";
import { describe, expect, it, vi } from "vitest";
import { TerminalToolSet } from "./tools";

function shell(
  overrides: Partial<ShellExecutionCapability> = {},
): ShellExecutionCapability {
  return {
    run: vi.fn(),
    sessionOpen: vi.fn(async () => 7),
    sessionRun: vi.fn(async () => ({
      stdout: "ok",
      stderr: "",
      exit_code: 0,
      timed_out: false,
      truncated: false,
      cwd_after: "/project/next",
    })),
    sessionClose: vi.fn(async () => {}),
    backgroundSpawn: vi.fn(async () => 12),
    backgroundLogs: vi.fn(async () => ({ output: "ready", next_offset: 5 })),
    backgroundKill: vi.fn(async () => {}),
    backgroundList: vi.fn(() => []),
    liveResources: vi.fn(() => []),
    ...overrides,
  };
}

function runtime(overrides: Partial<AiToolRuntime> = {}): AiToolRuntime {
  return {
    getCwd: () => "/project",
    getWorkspaceEnv: () => ({ kind: "local" }),
    getSessionId: () => "chat-1",
    getTerminalContext: () => null,
    isActiveTerminalPrivate: () => false,
    injectIntoActivePty: () => false,
    ...overrides,
  };
}

describe("AI Tools: Terminal", () => {
  it("publishes independently replaceable shell, terminal, and view groups", () => {
    expect(new TerminalToolSet(shell()).contributions().map((entry) => entry.id))
      .toEqual(["shell", "terminal", "view"]);
  });

  it("reuses one provider-owned persistent shell per chat and workspace", async () => {
    const provider = shell();
    const set = new TerminalToolSet(provider);
    const tools = set.shellTools(runtime());
    await tools.bash_run.execute({ command: "pwd" });
    await tools.bash_run.execute({ command: "git status" });
    expect(provider.sessionOpen).toHaveBeenCalledTimes(1);
    expect(provider.sessionRun).toHaveBeenCalledTimes(2);
  });

  it("uses a separate persistent handle for a different shared SSH workspace", async () => {
    const provider = shell();
    const set = new TerminalToolSet(provider);
    await set.shellTools(runtime()).bash_run.execute({ command: "pwd" });
    await set.shellTools(runtime({
      getWorkspaceEnv: () => ({ kind: "ssh", connectionId: "host", host: "host" }),
    })).bash_run.execute({ command: "pwd" });
    expect(provider.sessionOpen).toHaveBeenCalledTimes(2);
  });

  it("closes its session handles when the plugin is replaced", async () => {
    const provider = shell();
    const set = new TerminalToolSet(provider);
    await set.shellTools(runtime()).bash_run.execute({ command: "pwd" });
    await set.dispose();
    expect(provider.sessionClose).toHaveBeenCalledWith(7);
  });

  it("approval-gates execution and rejects catastrophic commands", async () => {
    const provider = shell();
    const tools = new TerminalToolSet(provider).shellTools(runtime());
    expect(tools.bash_run.needsApproval).toBe(true);
    expect(tools.bash_background.needsApproval).toBe(true);
    const catastrophicGate = (
      tools.bash_run as typeof tools.bash_run & {
        alwaysNeedsApproval?: (input: unknown) => boolean;
      }
    ).alwaysNeedsApproval;
    expect(catastrophicGate).toBeTypeOf("function");
    if (typeof catastrophicGate !== "function") {
      throw new Error("bash_run must retain a catastrophic approval gate");
    }
    expect(await catastrophicGate({ command: "pnpm test" })).toBe(false);
    expect(await catastrophicGate({ command: "sudo reboot" })).toBe(true);
    await expect(tools.bash_run.execute({ command: "rm -rf ~" }))
      .resolves.toMatchObject({ error: expect.stringContaining("Refused") });
    expect(provider.sessionRun).not.toHaveBeenCalled();
  });

  it("runs visible commands only in the already-visible terminal", async () => {
    const runInTerminal = vi.fn(async () => ({ output: "done", cwd: "/project" }));
    const set = new TerminalToolSet(shell());
    const refused = await set.terminalTools(runtime({
      getActiveViewKind: () => "preview",
      runInTerminal,
    })).terminal_run.execute({ command: "ls" });
    expect(refused).toMatchObject({ error: expect.stringContaining("bash_run") });
    expect(runInTerminal).not.toHaveBeenCalled();

    const result = await set.terminalTools(runtime({
      getActiveViewKind: () => "terminal",
      runInTerminal,
    })).terminal_run.execute({ command: "ls" });
    expect(result).toEqual({ ran: "ls", output: "done", cwd: "/project" });
  });

  it("withholds private scrollback and preserves both ends of large output", async () => {
    const set = new TerminalToolSet(shell());
    const privateResult = await set.terminalTools(runtime({
      isActiveTerminalPrivate: () => true,
      getTerminalContext: () => "secret",
    })).get_terminal_output.execute({});
    expect(privateResult).toMatchObject({ error: expect.stringContaining("Privacy") });

    const buffer = `ERROR at start\n${"warning: repeated diagnostic text\n".repeat(1900)}exit 1`;
    const result = await set.terminalTools(runtime({
      getTerminalContext: () => buffer,
    })).get_terminal_output.execute({ lines: 2000 }) as { output: string };
    expect(result.output).toContain("warning");
    expect(result.output).toContain("exit 1");
    expect(result.output).toMatch(/tokens truncated/);
  });

  it("opens only loopback previews", async () => {
    const openPreview = vi.fn(() => true);
    const tools = new TerminalToolSet(shell()).terminalTools(runtime({ openPreview }));
    expect(await tools.open_preview.execute({ url: "https://example.com" }))
      .toMatchObject({ error: expect.stringContaining("localhost") });
    expect(await tools.open_preview.execute({ url: "http://localhost:5173" }))
      .toEqual({ url: "http://localhost:5173", ok: true });
    expect(openPreview).toHaveBeenCalledTimes(1);
  });

  it("lists and focuses tabs through the session runtime", async () => {
    const focusView = vi.fn(() => ({ ok: true, created: false }));
    const tools = new TerminalToolSet(shell()).viewTools(runtime({
      listTabs: () => [{ id: 1, kind: "editor", title: "a.ts", active: true }],
      focusView,
      getActiveViewKind: () => "editor",
    }));
    expect(await tools.list_tabs.execute({})).toEqual({
      tabs: [{ id: 1, kind: "editor", title: "a.ts", active: true }],
    });
    expect(await tools.focus_view.execute({ id: 1 })).toMatchObject({
      ok: true,
      active_view: "editor",
    });
  });
});

import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ShellHistoryCapability } from "@termco/terminal-base";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSystemTools } from "./tools";

const desktop = {
  notify: vi.fn(),
  readClipboardText: vi.fn(() => ""),
  writeClipboardText: vi.fn(),
  revealItem: vi.fn(),
} as unknown as DesktopIntegrationCapability;
const history = {
  list: vi.fn(async () => [] as string[]),
} as unknown as ShellHistoryCapability;
const context = {
  getCwd: () => "/home/user/project",
  getWorkspaceEnv: () => ({ kind: "local" as const }),
};

beforeEach(() => vi.clearAllMocks());

describe("source-owned system AI tools", () => {
  it("uses the shared desktop provider for notifications and clipboard", async () => {
    const tools = buildSystemTools(desktop, history, context);
    await tools.notify_user.execute({ message: "Done", title: "Build" });
    expect(desktop.notify).toHaveBeenCalledWith("Build", "Done");
    await tools.write_clipboard.execute({ text: "copied" });
    expect(desktop.writeClipboardText).toHaveBeenCalledWith("copied");
  });

  it("uses the shared history provider with the chat workspace", async () => {
    vi.mocked(history.list).mockResolvedValue(["git status"]);
    const result = await buildSystemTools(desktop, history, context)
      .command_history.execute({ query: "git", limit: 20 });
    expect(history.list).toHaveBeenCalledWith("git", 20, { kind: "local" });
    expect(result).toEqual({ entries: ["git status"] });
  });

  it("resolves relative reveal paths against the chat cwd", async () => {
    const result = await buildSystemTools(desktop, history, context)
      .reveal_in_os.execute({ path: "src/index.ts" });
    expect(desktop.revealItem).toHaveBeenCalledWith(
      "/home/user/project/src/index.ts",
    );
    expect(result).toEqual({ ok: true, path: "/home/user/project/src/index.ts" });
  });

  it("keeps every system tool auto-executing", () => {
    const tools = buildSystemTools(desktop, history, context);
    expect(Object.values(tools).every((tool) => tool.needsApproval === undefined))
      .toBe(true);
  });
});

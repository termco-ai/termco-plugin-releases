import { describe, expect, it } from "vitest";
import { formatEnvBlock, injectEnvIntoLastUser } from "./envContext";

describe("chat live environment context", () => {
  it("formats the exact active workspace, terminal, file, and view state", () => {
    expect(formatEnvBlock({
      workspaceRoot: "/repo",
      cwd: "/repo/src",
      activeFile: "/repo/src/main.ts",
      activeKind: "editor",
      terminalPrivate: true,
    })).toBe(
      "<env>\n" +
      "workspace_root: /repo\n" +
      "active_terminal_cwd: /repo/src\n" +
      "active_file: /repo/src/main.ts\n" +
      "active_view: editor\n" +
      "active_terminal_mode: private\n" +
      "</env>",
    );
  });

  it("injects context only into the latest user turn without mutating history", () => {
    const messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "first" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "reply" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "question" }] },
    ] as never[];
    const result = injectEnvIntoLastUser(messages, "<env>live</env>");
    expect(result).not.toBe(messages);
    expect((messages[2] as { parts: Array<{ text: string }> }).parts[0].text).toBe("question");
    expect((result[2].parts[0] as { text: string }).text).toBe(
      "<env>live</env>\n\nquestion",
    );
  });
});

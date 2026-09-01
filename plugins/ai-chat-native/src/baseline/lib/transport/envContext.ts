import type { UIMessage } from "ai";

export type LiveSnapshot = {
  cwd: string | null;
  terminalPrivate: boolean;
  workspaceRoot: string | null;
  activeFile: string | null;
  activeKind: string | null;
};

export function formatEnvBlock(live: LiveSnapshot): string | null {
  const lines: string[] = [];
  if (live.workspaceRoot) lines.push(`workspace_root: ${live.workspaceRoot}`);
  if (live.cwd) lines.push(`active_terminal_cwd: ${live.cwd}`);
  if (live.activeFile) lines.push(`active_file: ${live.activeFile}`);
  if (live.activeKind) lines.push(`active_view: ${live.activeKind}`);
  if (live.terminalPrivate) lines.push("active_terminal_mode: private");
  return lines.length > 0 ? `<env>\n${lines.join("\n")}\n</env>` : null;
}

export function injectEnvIntoLastUser(
  messages: readonly UIMessage[],
  envBlock: string,
): UIMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const parts = message.parts as ReadonlyArray<{ type: string; text?: string }>;
    const textIndex = parts.findIndex((part) => part.type === "text");
    const nextParts = textIndex < 0
      ? [{ type: "text", text: envBlock }, ...parts]
      : parts.map((part, partIndex) =>
          partIndex === textIndex
            ? { ...part, text: `${envBlock}\n\n${part.text ?? ""}` }
            : part,
        );
    const result = messages.slice();
    result[index] = { ...message, parts: nextParts } as UIMessage;
    return result;
  }
  return messages.slice();
}
